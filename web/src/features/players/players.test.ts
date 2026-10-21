import { describe, expect, it } from "vitest";

import { parseBulkNames } from "@/features/players/bulk-names";
import { countPlayersByFilter, getPlayerStatus, getStatusLabel, getVisiblePlayers } from "@/features/players/player-status";
import type { Player } from "@/services/players";

function makePlayer(id: number, name: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    queue_id: "q1",
    name,
    skill: "beginner",
    games_played: 0,
    queue_position: id,
    is_playing: false,
    is_waiting_match: false,
    is_paused: false,
    rest_games_needed: 0,
    last_match_no: 0,
    leave_code_hash: null,
    court_fee_pending: false,
    created_at: "2026-10-20T00:00:00Z",
    removed_at: null,
    ...overrides,
  };
}

describe("parseBulkNames", () => {
  it("strips numbering and bullets like the old modal", () => {
    expect(parseBulkNames("1. Clark\n2) Diego\n3- Lenon\n- Ana\n• Ben\n* Cy")).toEqual([
      "Clark",
      "Diego",
      "Lenon",
      "Ana",
      "Ben",
      "Cy",
    ]);
  });

  it("drops blank lines and repeated names (any capitalization)", () => {
    expect(parseBulkNames("Juan\n\n  \njuan\nJUAN\nMaria")).toEqual(["Juan", "Maria"]);
  });
});

describe("player status", () => {
  it("checks queued, then playing, then paused, then resting", () => {
    expect(getPlayerStatus(makePlayer(1, "A", { is_waiting_match: true, is_paused: true })).type).toBe("queued");
    expect(getPlayerStatus(makePlayer(1, "A", { is_playing: true })).type).toBe("playing");
    expect(getPlayerStatus(makePlayer(1, "A", { is_paused: true, rest_games_needed: 2 })).type).toBe("paused");
    expect(getStatusLabel(getPlayerStatus(makePlayer(1, "A", { rest_games_needed: 2 })))).toBe("Rest 2");
    expect(getStatusLabel(getPlayerStatus(makePlayer(1, "A")))).toBe("Ready");
  });

  it("sorts by status priority, then queue position", () => {
    const players = [
      makePlayer(1, "OnCourt", { is_playing: true, queue_position: 0 }),
      makePlayer(2, "Resting", { rest_games_needed: 1, queue_position: 1 }),
      makePlayer(3, "ReadyLate", { queue_position: 5 }),
      makePlayer(4, "Break", { is_paused: true, queue_position: 2 }),
      makePlayer(5, "ReadyEarly", { queue_position: 3 }),
      makePlayer(6, "Next", { is_waiting_match: true, queue_position: 4 }),
    ];
    expect(getVisiblePlayers(players, "", "all").map((entry) => entry.player.name)).toEqual([
      "ReadyEarly",
      "ReadyLate",
      "Next",
      "Break",
      "Resting",
      "OnCourt",
    ]);
  });

  it("filters by search and status, and counts each filter", () => {
    const players = [
      makePlayer(1, "Juan"),
      makePlayer(2, "Juana", { is_paused: true }),
      makePlayer(3, "Pedro", { rest_games_needed: 1 }),
      makePlayer(4, "Ana", { is_playing: true }),
    ];
    expect(getVisiblePlayers(players, " jua ", "all").map((entry) => entry.player.name)).toEqual(["Juan", "Juana"]);
    expect(getVisiblePlayers(players, "", "paused").map((entry) => entry.player.name)).toEqual(["Juana"]);
    expect(countPlayersByFilter(players)).toEqual({ all: 4, ready: 1, paused: 1, resting: 1, queued: 0 });
  });
});
