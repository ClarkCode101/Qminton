import { describe, expect, it } from "vitest";

import { emptyPairMemory, pairKey, pickMatch, type EnginePlayer } from "@/features/matchmaking/engine";
import { createSeededRng } from "@/lib/random";

// A whole evening in miniature: 50 doubles players, 4 courts, 100 games.
// Each game: pick 4 players, start them; when all courts are busy, the oldest
// game finishes and its players go to the back of the line. Pair memory is
// updated like the database does (private.apply_match_start).
// oldRule = the old OrcaRally memory (no session count of teammates), to compare.
function simulate(seed: number, oldRule = false) {
  const skills = ["beginner", "intermediate", "advance"] as const;
  const players: EnginePlayer[] = Array.from({ length: 50 }, (_, index) => ({
    id: index + 1,
    name: `P${index + 1}`,
    skill: skills[index % 3],
    queuePosition: index,
    gamesPlayed: 0,
    isPlaying: false,
    isWaitingMatch: false,
    isPaused: false,
    restGamesNeeded: 0,
  }));
  const memory = emptyPairMemory();
  const rng = createSeededRng(seed);
  const onCourt: EnginePlayer[][] = [];
  let nextPosition = players.length;
  let repeats = 0;
  const everTeammates = new Set<string>();

  for (let matchNo = 1; matchNo <= 100; matchNo += 1) {
    if (onCourt.length === 4) {
      for (const player of onCourt.shift()!) {
        player.isPlaying = false;
        player.queuePosition = nextPosition++;
      }
    }

    const result = pickMatch({ mode: "doubles", players, currentMatchNo: matchNo - 1, hasPendingMatches: false, memory, rng });
    if (!result.ok) throw new Error(result.message);

    for (const team of [result.team1, result.team2]) {
      const key = pairKey(team[0].id, team[1].id);
      if (everTeammates.has(key)) repeats += 1;
      everTeammates.add(key);
      memory.partner.set(key, matchNo);
      if (!oldRule) memory.partnerCount.set(key, (memory.partnerCount.get(key) ?? 0) + 1);
    }
    const all = [...result.team1, ...result.team2];
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const key = pairKey(all[i].id, all[j].id);
        memory.pair.set(key, matchNo);
        const sameTeam = result.team1.includes(all[i]) === result.team1.includes(all[j]);
        if (!sameTeam) memory.opponent.set(key, matchNo);
      }
    }
    for (const player of all) {
      player.isPlaying = true;
      player.gamesPlayed += 1;
    }
    onCourt.push(all);
  }

  return { repeats, gamesPlayed: players.map((player) => player.gamesPlayed) };
}

describe("a 50-player doubles session", () => {
  it("never pairs the same teammates twice in 100 games", () => {
    for (const seed of [1, 2, 3]) {
      expect(simulate(seed).repeats).toBe(0);
    }
  });

  it("the old rule (3-match cooldown only) repeated teammates often", () => {
    // Measured: 57, 70 and 64 repeats out of 200 teams.
    const repeats = [1, 2, 3].map((seed) => simulate(seed, true).repeats);
    expect(Math.min(...repeats)).toBeGreaterThan(40);
  });

  it("still shares the games fairly, like the old rule (7 to 9 games, almost everyone 8)", () => {
    for (const seed of [1, 2, 3]) {
      const { gamesPlayed } = simulate(seed);
      expect(Math.max(...gamesPlayed) - Math.min(...gamesPlayed)).toBeLessThanOrEqual(2);
      expect(gamesPlayed.filter((games) => games === 8).length).toBeGreaterThanOrEqual(44);
    }
  });
});
