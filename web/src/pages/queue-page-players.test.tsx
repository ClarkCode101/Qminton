import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QueuePage } from "@/pages/queue-page";
import { bulkAddPlayers, listPlayers, removePlayer, setPlayerPaused, type Player } from "@/services/players";
import { getQueue } from "@/services/queues";
import { renderApp } from "@/test/render-app";

// Never talk to the real Supabase in tests.
vi.mock("@/services/queues", () => ({ getQueue: vi.fn(), listQueues: vi.fn(async () => []) }));
vi.mock("@/services/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/services/check-in", () => ({
  setCheckIn: vi.fn(async () => ({ queue_id: "q1", token: "tok", is_open: false, updated_at: "2026-10-20T00:00:00Z" })),
}));
vi.mock("@/services/billing", () => ({ listLedger: vi.fn(async () => []), listBillingPlayers: vi.fn(async () => []) }));
vi.mock("@/services/matches", () => ({ listActiveMatches: vi.fn(async () => []), listMatchHistory: vi.fn(async () => ({ entries: [], total: 0 })) }));
vi.mock("@/services/players", () => ({
  listPlayers: vi.fn(),
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
    leave_code_hash: null,
    court_fee_pending: false,
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
      status: "live",
      starts_at: null,
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
  });

  it("shows the players sidebar next to the courts", async () => {
    renderApp(routes, "/queue/q1");

    const sidebar = await screen.findByRole("complementary", { name: "Players" });
    expect(within(sidebar).getByText("2 players")).toBeInTheDocument();
    // One compact row per player: name, skill and games, status.
    const juanRow = within(sidebar).getByRole("button", { name: "Show details for Juan" });
    expect(within(juanRow).getByText("Juan")).toBeInTheDocument();
    expect(within(juanRow).getByText("Beginner · 0 games")).toBeInTheDocument();
    expect(within(juanRow).getByText("Ready")).toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: "Show details for Maria" })).toBeInTheDocument();
  });

  it("adds one player: type, Enter, pick a skill, add", async () => {
    vi.mocked(bulkAddPlayers).mockResolvedValue([makePlayer(3, "Pedro")]);
    renderApp(routes, "/queue/q1");

    fireEvent.click((await screen.findAllByRole("button", { name: "Add Player" }))[0]);
    const dialog = screen.getByRole("dialog", { name: "Add Players" });
    fireEvent.change(within(dialog).getByLabelText("Player name"), { target: { value: "  Pedro " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to list" }));
    const skills = within(dialog).getByRole("radiogroup", { name: "Skill level for Pedro" });
    fireEvent.click(within(skills).getByRole("radio", { name: "Intermediate" }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Add 1 player" }));
    });

    expect(bulkAddPlayers).toHaveBeenCalledWith("q1", [{ name: "Pedro", skill: "intermediate" }]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("adds one player straight from the box with the skill picked under it", async () => {
    vi.mocked(bulkAddPlayers).mockResolvedValue([makePlayer(3, "Pedro")]);
    renderApp(routes, "/queue/q1");

    fireEvent.click((await screen.findAllByRole("button", { name: "Add Player" }))[0]);
    const dialog = screen.getByRole("dialog", { name: "Add Players" });
    fireEvent.change(within(dialog).getByLabelText("Player name"), { target: { value: "Pedro" } });
    const nextSkill = within(dialog).getByRole("radiogroup", { name: "Skill level for the next player" });
    fireEvent.click(within(nextSkill).getByRole("radio", { name: "Advanced" }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Add 1 player" }));
    });

    expect(bulkAddPlayers).toHaveBeenCalledWith("q1", [{ name: "Pedro", skill: "advance" }]);
  });

  it("has a QR check-in tab next to typing names", async () => {
    renderApp(routes, "/queue/q1");

    fireEvent.click((await screen.findAllByRole("button", { name: "Add Player" }))[0]);
    const dialog = screen.getByRole("dialog", { name: "Add Players" });
    expect(within(dialog).getByRole("tab", { name: "Type names" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(within(dialog).getByRole("tab", { name: "QR check-in" }));

    expect(await within(dialog).findByText("Check-in is closed")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Player name")).not.toBeInTheDocument();
  });

  it("does nothing without a name", async () => {
    renderApp(routes, "/queue/q1");

    fireEvent.click((await screen.findAllByRole("button", { name: "Add Player" }))[0]);
    const dialog = screen.getByRole("dialog", { name: "Add Players" });
    expect(within(dialog).getByRole("button", { name: "Add players" })).toBeDisabled();
    expect(bulkAddPlayers).not.toHaveBeenCalled();
  });

  it("adds a pasted list, flags names already in the queue, and sets one skill for all", async () => {
    vi.mocked(bulkAddPlayers).mockResolvedValue([makePlayer(3, "Clark"), makePlayer(4, "Diego")]);
    renderApp(routes, "/queue/q1");

    fireEvent.click((await screen.findAllByRole("button", { name: "Add Player" }))[0]);
    const dialog = screen.getByRole("dialog", { name: "Add Players" });
    fireEvent.paste(within(dialog).getByLabelText("Player name"), {
      clipboardData: { getData: () => "1. Clark\n2. Diego\n3. juan\nclark" },
    });

    // "juan" is already in the queue (as Juan): flagged, and nothing can be added until it's removed.
    expect(within(dialog).getByText("Already in the queue")).toBeInTheDocument();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("1 name is already in the queue.");
    expect(within(dialog).getByRole("button", { name: "Add 2 players" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove it" }));
    expect(within(dialog).queryByText("juan")).not.toBeInTheDocument();
    const everyone = within(dialog).getByRole("radiogroup", { name: "Skill level for everyone" });
    fireEvent.click(within(everyone).getByRole("radio", { name: "Advanced" }));
    // Remove Diego again with the ✕ on his row.
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove Diego from the list" }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Add 1 player" }));
    });

    expect(bulkAddPlayers).toHaveBeenCalledWith("q1", [{ name: "Clark", skill: "advance" }]);
  });

  it("keeps the list when saving fails", async () => {
    vi.mocked(bulkAddPlayers).mockRejectedValue({ code: "P0001", message: "Add at most 100 players at a time" });
    renderApp(routes, "/queue/q1");

    fireEvent.click((await screen.findAllByRole("button", { name: "Add Player" }))[0]);
    const dialog = screen.getByRole("dialog", { name: "Add Players" });
    fireEvent.change(within(dialog).getByLabelText("Player name"), { target: { value: "Pedro" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to list" }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Add 1 player" }));
    });

    expect(await screen.findByText("Add at most 100 players at a time")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText("Pedro")).toBeInTheDocument();
  });

  it("removes a player after confirming", async () => {
    vi.mocked(removePlayer).mockResolvedValue();
    renderApp(routes, "/queue/q1");

    const sidebar = await screen.findByRole("complementary", { name: "Players" });
    // Actions show after tapping the row.
    expect(within(sidebar).queryByRole("button", { name: "Remove Juan" })).not.toBeInTheDocument();
    fireEvent.click(within(sidebar).getByRole("button", { name: "Show details for Juan" }));
    fireEvent.click(within(sidebar).getByRole("button", { name: "Remove Juan" }));
    expect(screen.getByText("Remove Juan from the queue?")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove Player" }));
    });

    expect(removePlayer).toHaveBeenCalledWith("q1", 1);
  });

  it("puts a player on break", async () => {
    // The database answers with the updated player; it shows right away.
    vi.mocked(setPlayerPaused).mockResolvedValue(makePlayer(1, "Juan", { is_paused: true }));
    renderApp(routes, "/queue/q1");

    const sidebar = await screen.findByRole("complementary", { name: "Players" });
    // What the database holds after the change (for the background reload).
    vi.mocked(listPlayers).mockResolvedValue([makePlayer(1, "Juan", { is_paused: true }), makePlayer(2, "Maria", { is_playing: true })]);
    fireEvent.click(within(sidebar).getByRole("button", { name: "Show details for Juan" }));
    await act(async () => {
      fireEvent.click(within(sidebar).getByRole("button", { name: "Take Break" }));
    });

    expect(setPlayerPaused).toHaveBeenCalledWith("q1", 1, true);
    expect(await screen.findByText("Juan paused")).toBeInTheDocument();
    // The row closes after an action; its status already says On Break.
    const juanRow = within(sidebar).getByRole("button", { name: "Show details for Juan" });
    expect(within(juanRow).getByText("On Break")).toBeInTheDocument();
  });

  it("does not offer actions for a player on court", async () => {
    renderApp(routes, "/queue/q1");

    const sidebar = await screen.findByRole("complementary", { name: "Players" });
    fireEvent.click(within(sidebar).getByRole("button", { name: "Show details for Maria" }));
    expect(within(sidebar).queryByRole("button", { name: "Remove Maria" })).not.toBeInTheDocument();
    expect(within(sidebar).getByText("Currently on court.")).toBeInTheDocument();
  });

  it("has only the Courts and Billing tabs (the Players tab was removed)", async () => {
    renderApp(routes, "/queue/q1");

    await screen.findByRole("complementary", { name: "Players" });
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("button", { name: "Courts" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Billing" })).toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "Players" })).not.toBeInTheDocument();
  });
});
