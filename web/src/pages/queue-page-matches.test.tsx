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
  resetMatchmaking,
  type MatchWithPlayers,
} from "@/services/matches";
import { listPlayers, type Player } from "@/services/players";
import { getQueue, type Queue } from "@/services/queues";
import { renderApp } from "@/test/render-app";

// Never talk to the real Supabase in tests.
vi.mock("@/services/queues", () => ({ getQueue: vi.fn(), listQueues: vi.fn(async () => []) }));
vi.mock("@/services/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/services/players", () => ({
  listPlayers: vi.fn(),
  listPlayerBilledTotals: vi.fn(async () => new Map()),
}));
vi.mock("@/services/matches", () => ({
  listActiveMatches: vi.fn(),
  getMatchmakingSnapshot: vi.fn(),
  createMatch: vi.fn(),
  cancelQueuedMatch: vi.fn(),
  finishGame: vi.fn(),
  resetMatchmaking: vi.fn(),
}));

const queue: Queue = {
  id: "q1",
  owner_id: "u1",
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
      .mockResolvedValue({ queue, players, memory: emptyPairMemory(), queuedCount: 0 });
    vi.mocked(createMatch).mockReset();
    vi.mocked(cancelQueuedMatch).mockReset();
    vi.mocked(finishGame).mockReset();
    vi.mocked(resetMatchmaking).mockReset();
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

  it("resets matchmaking, optionally including players on break", async () => {
    vi.mocked(resetMatchmaking).mockResolvedValue("Matchmaking reset; courts cleared, queue returned, and history preserved");
    renderApp(routes, "/queue/q1");

    fireEvent.click(await screen.findByRole("button", { name: "Reset Matchmaking" }));
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
