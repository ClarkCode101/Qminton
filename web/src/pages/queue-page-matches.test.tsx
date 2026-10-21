import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyPairMemory } from "@/features/matchmaking/engine";
import { QueuePage } from "@/pages/queue-page";
import {
  cancelQueuedMatch,
  createMatch,
  finishGame,
  getMatchmakingSnapshot,
  listActiveMatches,
  listMatchHistory,
  resetMatchmaking,
  type MatchWithPlayers,
} from "@/services/matches";
import { listPlayers, type Player } from "@/services/players";
import { getQueue, updateQueueSettings, type Queue } from "@/services/queues";
import { renderApp } from "@/test/render-app";

// Never talk to the real Supabase in tests.
vi.mock("@/services/queues", () => ({ getQueue: vi.fn(), listQueues: vi.fn(async () => []), updateQueueSettings: vi.fn() }));
vi.mock("@/services/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/services/players", () => ({
  listPlayers: vi.fn(),
  listPlayerBilledTotals: vi.fn(async () => new Map()),
}));
vi.mock("@/services/billing", () => ({ listLedger: vi.fn(async () => []), listBillingPlayers: vi.fn(async () => []) }));
vi.mock("@/services/matches", () => ({
  listActiveMatches: vi.fn(),
  listMatchHistory: vi.fn(),
  getMatchmakingSnapshot: vi.fn(),
  createMatch: vi.fn(),
  cancelQueuedMatch: vi.fn(),
  finishGame: vi.fn(),
  resetMatchmaking: vi.fn(),
}));

const queue: Queue = {
  id: "q1",
  owner_id: "u1",
  status: "live",
  starts_at: null,
  name: "Saturday Session",
  game_mode: "doubles",
  court_fee: 0,
  game_rate: 20,
  court_count: 2,
  match_no: 0,
  version: 7,
  created_at: "2026-10-22T00:00:00Z",
  updated_at: "2026-10-22T00:00:00Z",
};

function makePlayer(id: number, name: string): Player {
  return {
    id,
    queue_id: "q1",
    name,
    skill: "intermediate",
    games_played: 0,
    queue_position: id - 1,
    is_playing: false,
    is_waiting_match: false,
    is_paused: false,
    rest_games_needed: 0,
    last_match_no: 0,
    leave_code_hash: null,
    created_at: "2026-10-22T00:00:00Z",
    removed_at: null,
  };
}

const players = [makePlayer(1, "Ana"), makePlayer(2, "Ben"), makePlayer(3, "Cy"), makePlayer(4, "Di")];

const queuedMatch: MatchWithPlayers = {
  id: "m9",
  queue_id: "q1",
  match_no: null,
  status: "queued",
  queue_order: 1,
  court_no: null,
  balance_text: "Perfectly balanced!",
  explanation: "",
  queue_length: 1,
  cancel_reason: null,
  resume_existing: false,
  created_at: "2026-10-22T00:00:00Z",
  started_at: null,
  completed_at: null,
  match_players: ["Eve", "Fay", "Gus", "Hal"].map((name, index) => ({
    match_id: "m9",
    queue_id: "q1",
    player_id: 10 + index,
    team: index < 2 ? 1 : 2,
    slot: (index % 2) + 1,
    player_name: name,
    player_skill: "beginner" as const,
  })),
};

const routes = [{ path: "/queue/:queueId", element: <QueuePage /> }];
const conflict = { code: "P0001", message: "This queue was changed on another device. Please try again." };

describe("starting and queueing matches", () => {
  // Block body: a function returned from beforeEach would run as cleanup.
  beforeEach(() => {
    vi.mocked(getQueue).mockReset().mockResolvedValue(queue);
    vi.mocked(listPlayers).mockReset().mockResolvedValue(players);
    vi.mocked(listActiveMatches).mockReset().mockResolvedValue([]);
    vi.mocked(getMatchmakingSnapshot)
      .mockReset()
      .mockResolvedValue({ queue, players, memory: emptyPairMemory(), queuedCount: 0, startedCount: 0 });
    vi.mocked(createMatch).mockReset();
    vi.mocked(cancelQueuedMatch).mockReset();
    vi.mocked(finishGame).mockReset();
    vi.mocked(resetMatchmaking).mockReset();
    vi.mocked(listMatchHistory).mockReset().mockResolvedValue({ entries: [], total: 0 });
  });

  it("shows the Match Log with status, court and cancel reason", async () => {
    const finished: MatchWithPlayers = {
      ...queuedMatch,
      id: "h1",
      status: "completed",
      queue_order: null,
      court_no: 1,
      match_no: 3,
      started_at: "2026-10-22T10:00:00Z",
      completed_at: "2026-10-22T10:20:00Z",
    };
    const cancelled: MatchWithPlayers = {
      ...queuedMatch,
      id: "h2",
      status: "cancelled",
      queue_order: null,
      queue_length: 2,
      cancel_reason: "Queued match cancelled by operator",
    };
    vi.mocked(listMatchHistory).mockResolvedValue({ entries: [finished, cancelled], total: 15 });
    renderApp(routes, "/queue/q1");

    fireEvent.click(await screen.findByRole("button", { name: "Match Log (15)" }));
    const log = screen.getByRole("list", { name: "Recent results" });
    expect(within(log).getByText("Finished")).toBeInTheDocument();
    expect(within(log).getByText("Court 1")).toBeInTheDocument();
    expect(within(log).getByText("Cancelled")).toBeInTheDocument();
    expect(within(log).getByText("Coming up #2")).toBeInTheDocument();
    expect(within(log).getByText("Queued match cancelled by operator")).toBeInTheDocument();
    expect(within(log).getAllByText("Eve + Fay vs Gus + Hal")).toHaveLength(2);
  });

  it("finishes the game on a court and shows the result", async () => {
    const running: MatchWithPlayers = {
      ...queuedMatch,
      id: "m1",
      status: "started",
      queue_order: null,
      court_no: 2,
      match_no: 4,
      started_at: new Date().toISOString(),
    };
    vi.mocked(listActiveMatches).mockResolvedValue([running]);
    vi.mocked(finishGame).mockResolvedValue("Court is now available");
    renderApp(routes, "/queue/q1");

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Finish Game" }));
    });

    expect(finishGame).toHaveBeenCalledWith("q1", 2, "m1");
    expect(await screen.findByText("Court is now available")).toBeInTheDocument();
  });

  it("takes a match off its court at once, even when the reload is slow", async () => {
    const running: MatchWithPlayers = {
      ...queuedMatch,
      id: "m1",
      status: "started",
      queue_order: null,
      court_no: 2,
      match_no: 4,
      started_at: new Date().toISOString(),
    };
    // First load shows the match; the reload after Finish never arrives.
    vi.mocked(listActiveMatches).mockResolvedValueOnce([running]).mockReturnValue(new Promise(() => {}));
    vi.mocked(finishGame).mockRejectedValue({ code: "P0001", message: "Court is not occupied" });
    renderApp(routes, "/queue/q1");

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Finish Game" }));
    });

    expect(await screen.findByText("Court is not occupied")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finish Game" })).not.toBeInTheDocument();
  });

  it("resets matchmaking, optionally including players on break", async () => {
    vi.mocked(resetMatchmaking).mockResolvedValue("Matchmaking reset; courts cleared, queue returned, and history preserved");
    renderApp(routes, "/queue/q1");

    // Reset lives in the ⋯ menu, away from the everyday buttons.
    fireEvent.click(await screen.findByRole("button", { name: "More court actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Reset Matchmaking" }));
    const dialog = screen.getByRole("alertdialog", { name: "Reset matchmaking?" });
    fireEvent.click(within(dialog).getByLabelText(/Include players on break/));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Reset Matchmaking" }));
    });

    expect(resetMatchmaking).toHaveBeenCalledWith("q1", true);
    expect(await screen.findByText(/Matchmaking reset; courts cleared/)).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("picks 4 players and starts them on a court", async () => {
    vi.mocked(createMatch).mockResolvedValue({ status: "assigned", courtNo: 1, matchNo: 1, queueLength: 0 });
    renderApp(routes, "/queue/q1");

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Start Next Match" }));
    });

    expect(createMatch).toHaveBeenCalledTimes(1);
    const call = vi.mocked(createMatch).mock.calls[0][0];
    expect(call.expectedVersion).toBe(7);
    expect([...call.team1, ...call.team2].sort()).toEqual([1, 2, 3, 4]);
    expect(await screen.findByText("Game Created!")).toBeInTheDocument();
    // "Court 1" is in the toast and on the court card.
    expect(screen.getAllByText("Court 1").length).toBeGreaterThanOrEqual(2);
  });

  it("re-reads and tries once more when another device changed the queue", async () => {
    vi.mocked(createMatch)
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ status: "queued", courtNo: null, matchNo: null, queueLength: 1 });
    renderApp(routes, "/queue/q1");

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Start Next Match" }));
    });

    expect(getMatchmakingSnapshot).toHaveBeenCalledTimes(2);
    expect(createMatch).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Match queued (#1)")).toBeInTheDocument();
  });

  it("gives up after a second conflict with a readable message", async () => {
    vi.mocked(createMatch).mockRejectedValue(conflict);
    renderApp(routes, "/queue/q1");

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Start Next Match" }));
    });

    expect(createMatch).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(conflict.message)).toBeInTheDocument();
  });

  it("shows Up Next and cancels a queued match after confirming", async () => {
    vi.mocked(listActiveMatches).mockResolvedValue([queuedMatch]);
    vi.mocked(cancelQueuedMatch).mockResolvedValue();
    renderApp(routes, "/queue/q1");

    const upNext = await screen.findByRole("region", { name: "Up Next" });
    expect(within(upNext).getByText("Eve + Fay")).toBeInTheDocument();

    fireEvent.click(within(upNext).getByRole("button", { name: "View all" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove queued match 1" }));
    expect(screen.getByText("This queued match will be removed from the upcoming matches list.")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel Match" }));
    });

    expect(cancelQueuedMatch).toHaveBeenCalledWith("q1", "m9");
    expect(await screen.findByText("Queued match cancelled")).toBeInTheDocument();
  });
});

describe("auto-start", () => {
  const running: MatchWithPlayers = {
    ...queuedMatch,
    id: "m1",
    status: "started",
    queue_order: null,
    court_no: 2,
    match_no: 4,
    started_at: new Date().toISOString(),
  };
  const snapshot = (startedCount: number, queuedCount = 0) => ({
    queue,
    players,
    memory: emptyPairMemory(),
    queuedCount,
    startedCount,
  });

  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(getQueue).mockReset().mockResolvedValue(queue);
    vi.mocked(listPlayers).mockReset().mockResolvedValue(players);
    vi.mocked(listActiveMatches).mockReset().mockResolvedValue([]);
    vi.mocked(getMatchmakingSnapshot).mockReset();
    // Unless a test says otherwise, a new match goes to Up Next (all courts busy).
    vi.mocked(createMatch).mockReset().mockResolvedValue({ status: "queued", courtNo: null, matchNo: null, queueLength: 1 });
    vi.mocked(finishGame).mockReset().mockResolvedValue("Court is now available");
    vi.mocked(listMatchHistory).mockReset().mockResolvedValue({ entries: [], total: 0 });
  });

  it("is off by default and Finish Game then starts nothing", async () => {
    vi.mocked(listActiveMatches).mockResolvedValue([running]);
    renderApp(routes, "/queue/q1");

    expect(await screen.findByRole("switch", { name: "Auto-start" })).toHaveAttribute("aria-checked", "false");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Finish Game" }));
    });

    expect(finishGame).toHaveBeenCalledWith("q1", 2, "m1");
    expect(getMatchmakingSnapshot).not.toHaveBeenCalled();
    expect(createMatch).not.toHaveBeenCalled();
  });

  it("switching it on fills the free courts, readies 1 Up Next match, and is remembered", async () => {
    // 2 courts, none in use: 2 matches start, then a third goes to Up Next.
    vi.mocked(getMatchmakingSnapshot).mockResolvedValueOnce(snapshot(0)).mockResolvedValueOnce(snapshot(1)).mockResolvedValue(snapshot(2));
    vi.mocked(createMatch)
      .mockResolvedValueOnce({ status: "assigned", courtNo: 1, matchNo: 1, queueLength: 0 })
      .mockResolvedValueOnce({ status: "assigned", courtNo: 2, matchNo: 2, queueLength: 0 });
    renderApp(routes, "/queue/q1");

    await act(async () => {
      fireEvent.click(await screen.findByRole("switch", { name: "Auto-start" }));
    });

    expect(screen.getByRole("switch", { name: "Auto-start" })).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem("qminton:auto-start:q1")).toBe("on");
    expect(createMatch).toHaveBeenCalledTimes(3);
    expect(await screen.findByText("Auto-start: started 2 matches (Court 1, Court 2) + 1 ready in Up Next")).toBeInTheDocument();
  });

  it("starts a new match after Finish Game when it is on, then readies the next one", async () => {
    window.localStorage.setItem("qminton:auto-start:q1", "on");
    vi.mocked(listActiveMatches).mockResolvedValue([running]);
    vi.mocked(getMatchmakingSnapshot).mockResolvedValueOnce(snapshot(1)).mockResolvedValue(snapshot(2));
    vi.mocked(createMatch).mockResolvedValueOnce({ status: "assigned", courtNo: 2, matchNo: 5, queueLength: 0 });
    renderApp(routes, "/queue/q1");

    expect(await screen.findByRole("switch", { name: "Auto-start" })).toHaveAttribute("aria-checked", "true");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Finish Game" }));
    });

    expect(finishGame).toHaveBeenCalledWith("q1", 2, "m1");
    expect(createMatch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createMatch).mock.calls[0][0].expectedVersion).toBe(7);
    expect(await screen.findByText("Auto-start: started 1 match (Court 2) + 1 ready in Up Next")).toBeInTheDocument();
  });

  it("fills a newly added court when it is on", async () => {
    window.localStorage.setItem("qminton:auto-start:q1", "on");
    vi.mocked(listActiveMatches).mockResolvedValue([running]);
    // After adding a 3rd court: 2 of 3 busy -> one new match, then all 3 busy -> 1 to Up Next.
    vi.mocked(getMatchmakingSnapshot)
      .mockResolvedValueOnce({ ...snapshot(2), queue: { ...queue, court_count: 3 } })
      .mockResolvedValue({ ...snapshot(3), queue: { ...queue, court_count: 3 } });
    vi.mocked(updateQueueSettings).mockReset().mockResolvedValue({ ...queue, court_count: 3 });
    vi.mocked(createMatch).mockResolvedValueOnce({ status: "assigned", courtNo: 3, matchNo: 5, queueLength: 0 });
    renderApp(routes, "/queue/q1");

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Increase court count" }));
    });

    expect(updateQueueSettings).toHaveBeenCalledWith("q1", { courtCount: 3 });
    expect(createMatch).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Auto-start: started 1 match (Court 3) + 1 ready in Up Next")).toBeInTheDocument();
  });

  it("readies a new Up Next match when the waiting one took the finished court", async () => {
    window.localStorage.setItem("qminton:auto-start:q1", "on");
    vi.mocked(listActiveMatches).mockResolvedValue([running]);
    vi.mocked(finishGame).mockResolvedValue("Court finished; next queued match started");
    // Both courts busy again, Up Next now empty.
    vi.mocked(getMatchmakingSnapshot).mockResolvedValue(snapshot(2));
    renderApp(routes, "/queue/q1");

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Finish Game" }));
    });

    expect(createMatch).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Match queued (#1)")).toBeInTheDocument();
  });

  it("stays quiet when courts are full and no Up Next match can be made", async () => {
    window.localStorage.setItem("qminton:auto-start:q1", "on");
    vi.mocked(listActiveMatches).mockResolvedValue([running]);
    vi.mocked(getMatchmakingSnapshot).mockResolvedValue({ ...snapshot(2), players: players.slice(0, 3) });
    renderApp(routes, "/queue/q1");

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Finish Game" }));
    });

    expect(createMatch).not.toHaveBeenCalled();
    expect(screen.queryByText(/^Auto-start:/)).not.toBeInTheDocument();
  });

  it("leaves the court to Up Next when matches are waiting", async () => {
    window.localStorage.setItem("qminton:auto-start:q1", "on");
    vi.mocked(listActiveMatches).mockResolvedValue([running]);
    vi.mocked(getMatchmakingSnapshot).mockResolvedValue(snapshot(1, 1));
    renderApp(routes, "/queue/q1");

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Finish Game" }));
    });

    expect(getMatchmakingSnapshot).toHaveBeenCalledTimes(1);
    expect(createMatch).not.toHaveBeenCalled();
  });

  it("says why when a court is free but no match can be made", async () => {
    vi.mocked(getMatchmakingSnapshot).mockResolvedValue({ ...snapshot(0), players: players.slice(0, 3) });
    renderApp(routes, "/queue/q1");

    await act(async () => {
      fireEvent.click(await screen.findByRole("switch", { name: "Auto-start" }));
    });

    expect(createMatch).not.toHaveBeenCalled();
    expect(await screen.findByText(/^Auto-start: a court is free, but /)).toBeInTheDocument();
  });
});
