import { pickOne, shuffled, type Rng } from "@/lib/random";
import type { GameMode } from "@/services/queues";
import type { SkillLevel } from "@/services/players";

// Team picker: a line-by-line TypeScript port of create_auto_match in the old
// OrcaRally backend/main.py (the "source of truth"). It only CHOOSES the teams;
// the database function create_match re-checks and saves them.

export const SKILL_VALUES: Record<SkillLevel, number> = { beginner: 1, intermediate: 2, advance: 3 };

const RECENT_PAIR_COOLDOWN = 2;
const REPEAT_PAIR_WEIGHT = 100;
const SKILL_DIFF_WEIGHT = 10;
const RECENT_PARTNER_COOLDOWN = 3;
const PARTNER_REPEAT_WEIGHT = 300;
const RECENT_OPPONENT_COOLDOWN = 2;
const OPPONENT_REPEAT_WEIGHT = 60;
const OPPONENT_COUNT_WEIGHT = 35;
// Smaller than OPPONENT_COUNT_WEIGHT on purpose: a recent rematch (35) outweighs
// pulling in one just-resting player (5..15), but rested-vs-rested with no
// rematch (0) still beats any mix that includes a resting player.
const REST_MIX_WEIGHT = 5;

export interface EnginePlayer {
  id: number;
  name: string;
  skill: SkillLevel;
  queuePosition: number;
  gamesPlayed: number;
  isPlaying: boolean;
  isWaitingMatch: boolean;
  isPaused: boolean;
  restGamesNeeded: number;
}

// Last match number each pair met in, by kind (old pair_last_match /
// partner_last_match / opponent_last_match), plus singles meet counts
// (old opponent_pair_count). Keys come from pairKey().
export interface PairMemory {
  pair: Map<string, number>;
  partner: Map<string, number>;
  opponent: Map<string, number>;
  opponentCount: Map<string, number>;
}

export interface MatchmakingInput {
  mode: GameMode;
  // In queue order (queue_position ascending), like the old q["players"].
  players: EnginePlayer[];
  currentMatchNo: number;
  hasPendingMatches: boolean;
  memory: PairMemory;
  rng: Rng;
}

export type MatchmakingResult =
  | { ok: true; team1: EnginePlayer[]; team2: EnginePlayer[]; balanceText: string; explanation: string }
  | { ok: false; message: string };

export function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function emptyPairMemory(): PairMemory {
  return { pair: new Map(), partner: new Map(), opponent: new Map(), opponentCount: new Map() };
}

const isRested = (player: EnginePlayer) => player.restGamesNeeded <= 0;
const isOffCourt = (player: EnginePlayer) => !player.isPlaying && !player.isWaitingMatch;
const isAvailable = (player: EnginePlayer) => isOffCourt(player) && !player.isPaused;

// Old sort key (rest_games_needed, games_played, queue_position). Array.sort is
// stable, like Python's sort.
function byReadiness(left: EnginePlayer, right: EnginePlayer): number {
  return (
    left.restGamesNeeded - right.restGamesNeeded ||
    left.gamesPlayed - right.gamesPlayed ||
    left.queuePosition - right.queuePosition
  );
}

// Old _role_pair_repeat_penalty / _pair_repeat_penalty: the more recently two
// players met in this role, the bigger the penalty; 0 after the cooldown.
function rolePairPenalty(
  a: EnginePlayer,
  b: EnginePlayer,
  matchNo: number,
  lastMatch: Map<string, number>,
  cooldown: number,
  weight: number,
): number {
  const last = lastMatch.get(pairKey(a.id, b.id));
  if (last === undefined) return 0;
  const age = matchNo - last;
  if (age > cooldown) return 0;
  return (cooldown - age + 1) * weight;
}

function teamPartnerPenalty(team: EnginePlayer[], matchNo: number, memory: PairMemory): number {
  let penalty = 0;
  for (let i = 0; i < team.length; i += 1) {
    for (let j = i + 1; j < team.length; j += 1) {
      penalty += rolePairPenalty(team[i], team[j], matchNo, memory.partner, RECENT_PARTNER_COOLDOWN, PARTNER_REPEAT_WEIGHT);
    }
  }
  return penalty;
}

function opponentPairPenalty(team1: EnginePlayer[], team2: EnginePlayer[], matchNo: number, memory: PairMemory): number {
  let penalty = 0;
  for (const p1 of team1) {
    for (const p2 of team2) {
      penalty += rolePairPenalty(p1, p2, matchNo, memory.opponent, RECENT_OPPONENT_COOLDOWN, OPPONENT_REPEAT_WEIGHT);
    }
  }
  return penalty;
}

function matchRepeatPenalty(all: EnginePlayer[], matchNo: number, memory: PairMemory): number {
  let penalty = 0;
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      penalty += rolePairPenalty(all[i], all[j], matchNo, memory.pair, RECENT_PAIR_COOLDOWN, REPEAT_PAIR_WEIGHT);
    }
  }
  return penalty;
}

// Python's itertools.combinations(items, size), same order.
function combinations<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  const current: T[] = [];
  const walk = (start: number) => {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      current.push(items[index]);
      walk(index + 1);
      current.pop();
    }
  };
  walk(0);
  return result;
}

const sumSkill = (team: EnginePlayer[]) => team.reduce((total, player) => total + SKILL_VALUES[player.skill], 0);

export function buildBalanceText(team1: { skill: SkillLevel }[], team2: { skill: SkillLevel }[]): string {
  const balance = Math.abs(
    team1.reduce((total, player) => total + SKILL_VALUES[player.skill], 0) -
      team2.reduce((total, player) => total + SKILL_VALUES[player.skill], 0),
  );
  return balance === 0 ? "Perfectly balanced!" : `Balance: ${balance} point${balance > 1 ? "s" : ""}`;
}

interface SinglesParts {
  skillDiff: number;
  repeatPenalty: number;
  countPenalty: number;
  restPenalty: number;
}

interface DoublesParts {
  skillDiff: number;
  partnerPenalty: number;
  opponentPenalty: number;
  quartetRepeatPenalty: number;
  restPenalty: number;
}

function joinReasons(mode: "singles" | "doubles", reasons: string[]): string {
  if (reasons.length === 0) return `Picked the best ${mode} matchup available right now.`;
  if (reasons.length === 1) return `Picked a ${mode} match that ${reasons[0]}.`;
  return `Picked a ${mode} match that ${reasons.slice(0, -1).join(", ")}, and ${reasons[reasons.length - 1]}.`;
}

// Old _build_match_explanation (same wording).
export function buildSinglesExplanation(parts: SinglesParts): string {
  const reasons: string[] = [];
  if (parts.repeatPenalty === 0 && parts.countPenalty === 0) reasons.push("avoids a recent rematch");
  else reasons.push("uses the best available pairing right now");
  if (parts.restPenalty === 0) reasons.push("gives ready players the next turn");
  if (parts.skillDiff === 0) reasons.push("keeps the matchup even");
  else if (parts.skillDiff <= 1) reasons.push("keeps the skill levels close");
  return joinReasons("singles", reasons);
}

export function buildDoublesExplanation(parts: DoublesParts): string {
  const reasons: string[] = [];
  if (parts.partnerPenalty === 0 && parts.opponentPenalty === 0 && parts.quartetRepeatPenalty === 0) {
    reasons.push("avoids recent repeat pairings");
  } else {
    reasons.push("uses the best available group right now");
  }
  if (parts.restPenalty === 0) reasons.push("brings in players who are ready to play");
  if (parts.skillDiff === 0) reasons.push("keeps the teams balanced");
  else if (parts.skillDiff <= 1) reasons.push("keeps the teams close in level");
  return joinReasons("doubles", reasons);
}

export function pickMatch({ mode, players, currentMatchNo, hasPendingMatches, memory, rng }: MatchmakingInput): MatchmakingResult {
  const teamSize = mode === "singles" ? 1 : 2;
  const playersNeeded = teamSize * 2;

  // Only truly free players (not on court, not already in Up Next, not on break).
  let eligible = players.filter(isAvailable);
  if (eligible.length < playersNeeded) {
    return { ok: false, message: `Need at least ${playersNeeded} available (non-playing) players` };
  }

  // HARD preference: only rested players when there are enough of them.
  const restedPool = eligible.filter(isRested);
  if (restedPool.length >= playersNeeded) {
    eligible = [...restedPool];
    // Tight rested pool: add a small buffer of the least-resting players so the
    // scorer can avoid forcing an immediate rematch. (Like the old code, this
    // buffer looks at every off-court player, including ones on break.)
    if (restedPool.length < playersNeeded * 2) {
      const restingPool = players.filter((player) => isOffCourt(player) && !isRested(player)).sort(byReadiness);
      eligible.push(...restingPool.slice(0, playersNeeded));
    }
  } else {
    // Resting players become rested as queued matches play. Refuse now instead
    // of forcing a rematch of players who just finished.
    if (hasPendingMatches) {
      return { ok: false, message: "Not enough rested players. Finish a court to release the queued matches first." };
    }
    const restingPool = eligible.filter((player) => !isRested(player)).sort(byReadiness);
    const neededFromResting = playersNeeded - restedPool.length;
    eligible = [...restedPool, ...restingPool.slice(0, neededFromResting)];
    if (restedPool.length === 0) {
      eligible = restingPool.slice(0, playersNeeded);
    }
  }

  // Most ready first: lowest rest, fewest games, earliest in the queue.
  eligible.sort(byReadiness);

  let team1: EnginePlayer[];
  let team2: EnginePlayer[];
  let explanation: string;

  if (mode === "singles") {
    const pool = eligible.slice(0, Math.max(playersNeeded, playersNeeded * 3));
    const scored = combinations(pool, 2).map(([p1, p2]) => {
      const skillDiff = Math.abs(SKILL_VALUES[p1.skill] - SKILL_VALUES[p2.skill]);
      const isImmediateRematch = memory.opponent.get(pairKey(p1.id, p2.id)) === currentMatchNo;
      const repeatPenalty = rolePairPenalty(p1, p2, currentMatchNo, memory.opponent, RECENT_OPPONENT_COOLDOWN, OPPONENT_REPEAT_WEIGHT);
      const countPenalty = (memory.opponentCount.get(pairKey(p1.id, p2.id)) ?? 0) * OPPONENT_COUNT_WEIGHT;
      const queuePenalty = p1.queuePosition + p2.queuePosition;
      const restPenalty = (p1.restGamesNeeded + p2.restGamesNeeded) * REST_MIX_WEIGHT;
      const score = repeatPenalty + countPenalty + skillDiff * SKILL_DIFF_WEIGHT + queuePenalty * 0.01 + restPenalty;
      return { pair: [p1, p2] as const, score, isImmediateRematch, parts: { skillDiff, repeatPenalty, countPenalty, restPenalty } };
    });

    const nonImmediate = scored.filter((item) => !item.isImmediateRematch);
    const candidates = nonImmediate.length > 0 ? nonImmediate : scored;
    if (candidates.length === 0) {
      return { ok: false, message: "Unable to generate singles pairing" };
    }
    candidates.sort((left, right) => left.score - right.score);
    const chosen = pickOne(candidates.slice(0, Math.min(3, candidates.length)), rng);

    team1 = [chosen.pair[0]];
    team2 = [chosen.pair[1]];
    explanation = buildSinglesExplanation(chosen.parts);
  } else {
    const pool = eligible.slice(0, Math.max(playersNeeded, playersNeeded * 2));
    let bestScore = Number.POSITIVE_INFINITY;
    let best: { teamA: EnginePlayer[]; teamB: EnginePlayer[]; parts: DoublesParts } | null = null;

    for (const quartet of combinations(pool, 4)) {
      // Splits that keep the first player on team A (avoids mirrored duplicates).
      for (const combo of combinations([0, 1, 2, 3], 2)) {
        if (!combo.includes(0)) continue;
        const teamA = combo.map((index) => quartet[index]);
        const teamB = [0, 1, 2, 3].filter((index) => !combo.includes(index)).map((index) => quartet[index]);

        const skillDiff = Math.abs(sumSkill(teamA) - sumSkill(teamB));
        const partnerPenalty = teamPartnerPenalty(teamA, currentMatchNo, memory) + teamPartnerPenalty(teamB, currentMatchNo, memory);
        const opponentPenalty = opponentPairPenalty(teamA, teamB, currentMatchNo, memory);
        const quartetRepeatPenalty = matchRepeatPenalty([...teamA, ...teamB], currentMatchNo, memory);
        const queuePenalty = [...teamA, ...teamB].reduce((total, player) => total + player.queuePosition, 0);
        const restPenalty = [...teamA, ...teamB].reduce((total, player) => total + player.restGamesNeeded, 0) * REST_MIX_WEIGHT;
        const score =
          partnerPenalty +
          opponentPenalty +
          quartetRepeatPenalty +
          skillDiff * SKILL_DIFF_WEIGHT +
          queuePenalty * 0.01 +
          restPenalty +
          rng() * 0.001;

        if (score < bestScore) {
          bestScore = score;
          best = { teamA, teamB, parts: { skillDiff, partnerPenalty, opponentPenalty, quartetRepeatPenalty, restPenalty } };
        }
      }
    }

    if (!best) {
      return { ok: false, message: "Unable to generate doubles pairing" };
    }
    team1 = best.teamA;
    team2 = best.teamB;
    explanation = buildDoublesExplanation(best.parts);
  }

  // Random sides and order so the same names don't always show as Team 1.
  team1 = shuffled(team1, rng);
  team2 = shuffled(team2, rng);
  if (rng() < 0.5) {
    [team1, team2] = [team2, team1];
  }

  return { ok: true, team1, team2, balanceText: buildBalanceText(team1, team2), explanation };
}
