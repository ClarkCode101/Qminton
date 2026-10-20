import { describe, expect, it } from "vitest";

import {
  buildCourtViews,
  buildMatchToastMessage,
  getMatchActionState,
  getQueuedMatches,
} from "@/features/matchmaking/match-view";
import type { MatchWithPlayers } from "@/services/matches";
import type { Player } from "@/services/players";

function makePlayer(id: number, overrides: Partial<Player> = {}): Player {
  return {
    id,
    queue_id: "q1",
    name: `P${id}`,
    skill: "beginner",
    games_played: 0,
    queue_position: id,
    is_playing: false,
    is_waiting_match: false,
    is_paused: false,
    rest_games_needed: 0,
    last_match_no: 0,
    created_at: "2026-10-22T00:00:00Z",
    removed_at: null,
    ...overrides,
  };
}

function makeMatch(id: string, overrides: Partial<MatchWithPlayers>, names: [string, string, string, string]): MatchWithPlayers {
  return {
    id,
    queue_id: "q1",
    match_no: null,
    status: "queued",
    queue_order: null,
    court_no: null,
    balance_text: "",
    explanation: "",
    queue_length: 0,
    cancel_reason: null,
    resume_existing: false,
    created_at: "2026-10-22T00:00:00Z",
    started_at: null,
    completed_at: null,
    match_players: names.map((name, index) => ({
      match_id: id,
      queue_id: "q1",
      player_id: index + 1,
      team: index < 2 ? 1 : 2,
      slot: (index % 2) + 1,
      player_name: name,
      player_skill: "beginner",
    })),
    ...overrides,
  };
}

describe("getMatchActionState (the big Courts button)", () => {
  const four = [1, 2, 3, 4].map((id) => makePlayer(id));

  it("asks for more players", () => {
    expect(getMatchActionState(four.slice(0, 3), "doubles", 2, 0)).toMatchObject({ label: "Need 1 more player", disabled: true });
    expect(getMatchActionState([], "singles", 2, 0).label).toBe("Need 2 more players");
  });

  it("does not count players on break, on court or in Up Next", () => {
    const players = [...four.slice(0, 3), makePlayer(5, { is_paused: true }), makePlayer(6, { is_playing: true })];
    expect(getMatchActionState(players, "doubles", 2, 0).label).toBe("Need 1 more player");
  });

  it("starts or queues depending on free courts", () => {
    expect(getMatchActionState(four, "doubles", 1, 0)).toMatchObject({ label: "Start Next Match", disabled: false });
    expect(getMatchActionState(four, "doubles", 0, 0)).toMatchObject({ label: "Queue Next Match", disabled: false });
  });

  it("asks to finish a court when only resting players are free and matches are waiting", () => {
    const resting = four.map((player, index) => (index < 2 ? { ...player, rest_games_needed: 1 } : player));
    expect(getMatchActionState(resting, "doubles", 0, 1)).toMatchObject({
      label: "Finish a court first",
      disabled: true,
      blockedByRest: true,
    });
  });
});

describe("court and Up Next views", () => {
  it("puts started matches on their courts", () => {
    const started = makeMatch("m1", { status: "started", court_no: 2, started_at: "2026-10-22T01:00:00Z" }, ["A", "B", "C", "D"]);
    const courts = buildCourtViews(3, [started]);
    expect(courts.map((court) => court.status)).toEqual(["available", "occupied", "available"]);
    expect(courts[1].team1.map((player) => player.name)).toEqual(["A", "B"]);
    expect(courts[1].team2.map((player) => player.name)).toEqual(["C", "D"]);
  });

  it("lists queued matches in Up Next order", () => {
    const second = makeMatch("m2", { queue_order: 2 }, ["E", "F", "G", "H"]);
    const first = makeMatch("m1", { queue_order: 1 }, ["A", "B", "C", "D"]);
    expect(getQueuedMatches([second, first]).map((match) => match.id)).toEqual(["m1", "m2"]);
  });
});

describe("buildMatchToastMessage (old text)", () => {
  const team1 = [{ name: "Ana" }, { name: "Ben" }];
  const team2 = [{ name: "Cy" }, { name: "Di" }];

  it("doubles on a court", () => {
    expect(
      buildMatchToastMessage("doubles", { status: "assigned", courtNo: 2, matchNo: 5, queueLength: 0 }, team1, team2, "Perfectly balanced!"),
    ).toBe("Game Created!\nCourt 2\nTeam 1: Ana + Ben\nTeam 2: Cy + Di\nPerfectly balanced!");
  });

  it("singles queued", () => {
    expect(
      buildMatchToastMessage("singles", { status: "queued", courtNo: null, matchNo: null, queueLength: 3 }, [{ name: "Ana" }], [{ name: "Cy" }], ""),
    ).toBe("Match queued (#3)\nAna vs Cy");
  });
});
