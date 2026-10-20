import type { CourtView } from "@/features/courts/court-view";
import { getEmptyCourts } from "@/features/courts/court-view";
import type { CreateMatchResult, MatchPlayer, MatchWithPlayers } from "@/services/matches";
import type { Player } from "@/services/players";
import type { GameMode } from "@/services/queues";

export const PLAYERS_NEEDED: Record<GameMode, number> = { singles: 2, doubles: 4 };

// Team members in slot order.
export function teamPlayers(match: MatchWithPlayers, team: 1 | 2): MatchPlayer[] {
  return match.match_players.filter((player) => player.team === team).sort((left, right) => left.slot - right.slot);
}

// Old formatTeamLabel: "Ana" in singles, "Ana + Ben" in doubles.
export function formatTeamLabel(players: { name?: string; player_name?: string }[], mode: GameMode): string {
  return players.map((player) => player.player_name ?? player.name ?? "").join(mode === "singles" ? "" : " + ");
}

// Courts 1..court_count, filled in with the match running on each.
export function buildCourtViews(courtCount: number, matches: MatchWithPlayers[]): CourtView[] {
  const courts = getEmptyCourts(courtCount);
  for (const match of matches) {
    if (match.status !== "started" || match.court_no === null) continue;
    const court = courts[match.court_no - 1];
    if (!court) continue;
    court.status = "occupied";
    court.startedAt = match.started_at;
    court.team1 = teamPlayers(match, 1).map((player) => ({ id: player.player_id, name: player.player_name }));
    court.team2 = teamPlayers(match, 2).map((player) => ({ id: player.player_id, name: player.player_name }));
  }
  return courts;
}

export function getQueuedMatches(matches: MatchWithPlayers[]): MatchWithPlayers[] {
  return matches
    .filter((match) => match.status === "queued")
    .sort((left, right) => (left.queue_order ?? 0) - (right.queue_order ?? 0));
}

export interface MatchActionState {
  label: string;
  disabled: boolean;
  blockedByRest: boolean;
  hint: string;
}

// The big button on the Courts tab (old getAutoMatchLabel + its hint).
// Change from the old app: players on break are not counted as available, so
// the button no longer says "Start Next Match" when only paused players are free.
export function getMatchActionState(
  players: Player[],
  mode: GameMode,
  freeCourts: number,
  queuedCount: number,
): MatchActionState {
  const needed = PLAYERS_NEEDED[mode];
  const available = players.filter((player) => !player.is_playing && !player.is_waiting_match && !player.is_paused);
  const restedAvailable = available.filter((player) => player.rest_games_needed === 0).length;
  const blockedByRest = available.length >= needed && restedAvailable < needed && queuedCount > 0;

  let label: string;
  if (available.length < needed) {
    const missing = needed - available.length;
    label = `Need ${missing} more player${missing === 1 ? "" : "s"}`;
  } else if (blockedByRest) {
    label = "Finish a court first";
  } else {
    label = freeCourts === 0 ? "Queue Next Match" : "Start Next Match";
  }

  const hint = blockedByRest
    ? "Players are available, but the rest rules require you to finish a court before queueing another match."
    : freeCourts === 0
      ? "All courts are occupied, so the next match will be added to the queue."
      : "There is an open court, so the next match can start immediately.";

  return { label, disabled: available.length < needed || blockedByRest, blockedByRest, hint };
}

// Old buildMatchToastMessage (same text).
export function buildMatchToastMessage(
  mode: GameMode,
  result: CreateMatchResult,
  team1: { name: string }[],
  team2: { name: string }[],
  balanceText: string,
): string {
  const vs = `${team1[0]?.name} vs ${team2[0]?.name}`;
  const teams = `Team 1: ${formatTeamLabel(team1, mode)}\nTeam 2: ${formatTeamLabel(team2, mode)}`;

  if (result.status === "queued") {
    return mode === "singles" ? `Match queued (#${result.queueLength})\n${vs}` : `Match queued (#${result.queueLength})\n${teams}`;
  }
  if (result.courtNo === null) return "Match created";
  return mode === "singles"
    ? `Game Created!\nCourt ${result.courtNo}\n${vs}`
    : `Game Created!\nCourt ${result.courtNo}\n${teams}\n${balanceText}`;
}
