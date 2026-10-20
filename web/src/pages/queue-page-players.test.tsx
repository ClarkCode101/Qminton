import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QueuePage } from "@/pages/queue-page";
import {
  addPlayer,
  bulkAddPlayers,
  listPlayerBilledTotals,
  listPlayers,
  removePlayer,
  setPlayerPaused,
  type Player,
} from "@/services/players";
import { getQueue } from "@/services/queues";
import { renderApp } from "@/test/render-app";

// Never talk to the real Supabase in tests.
vi.mock("@/services/queues", () => ({ getQueue: vi.fn(), listQueues: vi.fn(async () => []) }));
vi.mock("@/services/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/services/billing", () => ({ listLedger: vi.fn(async () => []), listBillingPlayers: vi.fn(async () => []) }));
vi.mock("@/services/matches", () => ({ listActiveMatches: vi.fn(async () => []), listMatchHistory: vi.fn(async () => ({ entries: [], total: 0 })) }));
vi.mock("@/services/players", () => ({
  listPlayers: vi.fn(),
  listPlayerBilledTotals: vi.fn(),
  addPlayer: vi.fn(),
  bulkAddPlayers: vi.fn(),
  removePlayer: vi.fn(),
  setPlayerPaused: vi.fn(),
  movePlayerToBottom: vi.fn(),
}));

function makePlayer(id: number, name: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    queue_id: "q1",
    name,
    skill: "beginner",
    games_played: 0,
    queue_position: id - 1,
    is_playing: false,
    is_waiting_match: false,
    is_paused: false,
    rest_games_needed: 0,
    last_match_no: 0,
    created_at: "2026-10-20T00:00:00Z",
    removed_at: null,
    ...overrides,
  };
}

const routes = [{ path: "/queue/:queueId", element: <QueuePage /> }];

describe("queue page players", () => {
  // Block body: a function returned from beforeEach would run as cleanup.
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getQueue).mockResolvedValue({
      id: "q1",
      owner_id: "u1",
      name: "Saturday Session",
      game_mode: "doubles",
      court_fee: 50,
      game_rate: 20,
      court_count: 2,
      match_no: 0,
      version: 0,
      created_at: "2026-10-20T00:00:00Z",
      updated_at: "2026-10-20T00:00:00Z",
    });
    vi.mocked(listPlayers).mockResolvedValue([makePlayer(1, "Juan"), makePlayer(2, "Maria", { is_playing: true })]);
    vi.mocked(listPlayerBilledTotals).mockResolvedValue(new Map([[1, 50], [2, 70]]));
  });

  it("shows the players sidebar next to the courts", async () => {
    renderApp(routes, "/queue/q1");

    const sidebar = await screen.findByRole("complementary", { name: "Players" });
    expect(within(sidebar).getByText("2 players")).toBeInTheDocument();
    // Each flip card has the name on its front and back.
    expect(within(sidebar).getAllByText("Juan").length).toBeGreaterThan(0);
    expect(within(sidebar).getByRole("button", { name: "Show details for Maria" })).toBeInTheDocument();
  });

  it("adds a single player", async () => {
    vi.mocked(addPlayer).mockResolvedValue(makePlayer(3, "Pedro"));
    renderApp(routes, "/queue/q1");

    fireEvent.click((await screen.findAllByRole("button", { name: "Add Player" }))[0]);
    fireEvent.change(screen.getByLabelText("Player Name"), { target: { value: "  Pedro " } });
    fireEvent.click(screen.getByRole("radio", { name: /Intermediate/ }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add Player" }));
    });

    expect(addPlayer).toHaveBeenCalledWith("q1", { name: "Pedro", skill: "intermediate" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks for a name before adding", async () => {
    renderApp(routes, "/queue/q1");

    fireEvent.click((await screen.findAllByRole("button", { name: "Add Player" }))[0]);
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add Player" }));
    });

    expect(screen.getByText("Please enter player name")).toBeInTheDocument();
    expect(addPlayer).not.toHaveBeenCalled();
  });

  it("shows the database message for a duplicate name and keeps the form open", async () => {
    vi.mocked(addPlayer).mockImplementation(async () => {
      throw { code: "P0001", message: "Player already exists" };
    });
    renderApp(routes, "/queue/q1");

    fireEvent.click((await screen.findAllByRole("button", { name: "Add Player" }))[0]);
    fireEvent.change(screen.getByLabelText("Player Name"), { target: { value: "juan" } });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add Player" }));
    });

    expect(await screen.findByText("Player already exists")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("bulk adds a pasted list with one skill for all", async () => {
    vi.mocked(bulkAddPlayers).mockResolvedValue([makePlayer(3, "Clark"), makePlayer(4, "Diego")]);
    renderApp(routes, "/queue/q1");

    fireEvent.click((await screen.findAllByRole("button", { name: "Add Player" }))[0]);
    fireEvent.click(screen.getByRole("tab", { name: "Bulk Add" }));
    fireEvent.change(screen.getByLabelText("Paste Player List"), { target: { value: "1. Clark\n2. Diego\n3. juan\nclark" } });
    fireEvent.click(screen.getByTitle("Set all to Advanced"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add 3 Players" }));
    });

    expect(bulkAddPlayers).toHaveBeenCalledWith("q1", [
      { name: "Clark", skill: "advance" },
      { name: "Diego", skill: "advance" },
      { name: "juan", skill: "advance" },
    ]);
    expect(await screen.findByText("Added 2 players")).toBeInTheDocument();
    expect(screen.getByText("1 already in the queue (skipped)")).toBeInTheDocument();
  });

  it("removes a player after confirming", async () => {
    vi.mocked(removePlayer).mockResolvedValue();
    renderApp(routes, "/queue/q1");

    const sidebar = await screen.findByRole("complementary", { name: "Players" });
    fireEvent.click(within(sidebar).getByRole("button", { name: "Remove Juan" }));
    expect(screen.getByText("Remove Juan from the queue?")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove Player" }));
    });

    expect(removePlayer).toHaveBeenCalledWith("q1", 1);
  });

  it("puts a player on break", async () => {
    vi.mocked(setPlayerPaused).mockResolvedValue();
    renderApp(routes, "/queue/q1");

    const sidebar = await screen.findByRole("complementary", { name: "Players" });
    await act(async () => {
      fireEvent.click(within(sidebar).getByRole("button", { name: "Take Break" }));
    });

    expect(setPlayerPaused).toHaveBeenCalledWith("q1", 1, true);
    expect(await screen.findByText("Juan paused")).toBeInTheDocument();
  });

  it("does not offer actions for a player on court", async () => {
    renderApp(routes, "/queue/q1");

    const sidebar = await screen.findByRole("complementary", { name: "Players" });
    expect(within(sidebar).queryByRole("button", { name: "Remove Maria" })).not.toBeInTheDocument();
    expect(within(sidebar).getByText("Currently on court.")).toBeInTheDocument();
  });

  it("Players tab shows the stats table with billed totals", async () => {
    renderApp(routes, "/queue/q1");

    fireEvent.click(await screen.findByRole("button", { name: "Players" }));
    const table = screen.getByRole("table");
    expect(within(table).getByText("Total Billed")).toBeInTheDocument();
    expect(within(table).getByText("₱50")).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "Remove Maria" })).toBeDisabled();
  });
});
