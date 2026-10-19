import type { Player, SkillLevel } from "@/services/players";

// A player's status, in the same order of checks as the old app (QueueCard.getRestStatus).
export type PlayerStatus =
  | { type: "queued" }
  | { type: "playing" }
  | { type: "paused" }
  | { type: "resting"; gamesLeft: number }
  | { type: "ready" };

export type PlayerStatusType = PlayerStatus["type"];
export type PlayerFilter = "all" | "ready" | "paused" | "resting" | "queued";

export const SKILL_LABELS: Record<SkillLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advance: "Advanced",
};

// Skill levels in order, with how many bars the skill icon fills.
export const SKILLS: { value: SkillLevel; bars: 1 | 2 | 3 }[] = [
  { value: "beginner", bars: 1 },
  { value: "intermediate", bars: 2 },
  { value: "advance", bars: 3 },
];

export const FILTER_OPTIONS: { value: PlayerFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ready", label: "Ready" },
  { value: "paused", label: "On Break" },
  { value: "resting", label: "Resting" },
  { value: "queued", label: "Up Next" },
];

// Ready first, players on court last (old MAIN_LIST_STATUS_PRIORITY).
const STATUS_PRIORITY: Record<PlayerStatusType, number> = {
  ready: 0,
  queued: 1,
  paused: 2,
  resting: 3,
  playing: 4,
};

export function getPlayerStatus(player: Player): PlayerStatus {
  if (player.is_waiting_match) return { type: "queued" };
  if (player.is_playing) return { type: "playing" };
  if (player.is_paused) return { type: "paused" };
  if (player.rest_games_needed > 0) return { type: "resting", gamesLeft: player.rest_games_needed };
  return { type: "ready" };
}

export function getStatusLabel(status: PlayerStatus): string {
  switch (status.type) {
    case "queued":
      return "Up Next";
    case "playing":
      return "On Court";
    case "paused":
      return "On Break";
    case "resting":
      return `Rest ${status.gamesLeft}`;
    case "ready":
      return "Ready";
  }
}

// On court or locked into a queued match: can't be paused, moved or removed.
export function isPlayerLocked(player: Player): boolean {
  return player.is_playing || player.is_waiting_match;
}

export interface PlayerEntry {
  player: Player;
  status: PlayerStatus;
}

// The sidebar list: search by name, filter by status, then sort by status
// priority -> queue position -> id (same as the old sidebar).
export function getVisiblePlayers(players: Player[], searchQuery: string, filter: PlayerFilter): PlayerEntry[] {
  const query = searchQuery.trim().toLowerCase();

  return players
    .map((player) => ({ player, status: getPlayerStatus(player) }))
    .filter(({ player, status }) => {
      const matchesSearch = query.length === 0 || player.name.toLowerCase().includes(query);
      const matchesFilter = filter === "all" || status.type === filter;
      return matchesSearch && matchesFilter;
    })
    .sort(
      (left, right) =>
        STATUS_PRIORITY[left.status.type] - STATUS_PRIORITY[right.status.type] ||
        left.player.queue_position - right.player.queue_position ||
        left.player.id - right.player.id,
    );
}

// How many players are in each filter (for the filter chips).
export function countPlayersByFilter(players: Player[]): Record<PlayerFilter, number> {
  const counts: Record<PlayerFilter, number> = { all: players.length, ready: 0, paused: 0, resting: 0, queued: 0 };
  for (const player of players) {
    const type = getPlayerStatus(player).type;
    if (type !== "playing") counts[type] += 1;
  }
  return counts;
}
