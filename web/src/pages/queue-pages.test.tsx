import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomePage } from "@/pages/home-page";
import { LandingPage } from "@/pages/landing-page";
import { QueuePage } from "@/pages/queue-page";
import {
  createQueue,
  deleteQueue,
  getQueue,
  listQueues,
  renameQueue,
  updateQueueSettings,
  type QueueSummary,
} from "@/services/queues";
import { formatSessionDate } from "@/lib/format";
import { setQueuePlan } from "@/services/signups";
import { renderApp } from "@/test/render-app";
import { ShowPath } from "@/test/show-path";

// Never talk to the real Supabase in tests.
vi.mock("@/services/queues", () => ({
  listQueues: vi.fn(),
  getQueue: vi.fn(),
  createQueue: vi.fn(),
  deleteQueue: vi.fn(),
  updateQueueSettings: vi.fn(),
  renameQueue: vi.fn(),
}));
vi.mock("@/services/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/services/signups", () => ({
  setQueuePlan: vi.fn(),
  listSignups: vi.fn(async () => []),
  removeSignup: vi.fn(),
  startSession: vi.fn(),
}));
vi.mock("@/services/billing", () => ({ listLedger: vi.fn(async () => []), listBillingPlayers: vi.fn(async () => []) }));
vi.mock("@/services/matches", () => ({ listActiveMatches: vi.fn(async () => []), listMatchHistory: vi.fn(async () => ({ entries: [], total: 0 })) }));
vi.mock("@/services/players", () => ({
  listPlayers: vi.fn(async () => []),
}));

const listQueuesMock = vi.mocked(listQueues);
const getQueueMock = vi.mocked(getQueue);
const createQueueMock = vi.mocked(createQueue);
const deleteQueueMock = vi.mocked(deleteQueue);

function makeQueue(overrides: Partial<QueueSummary> = {}): QueueSummary {
  return {
    id: "q1",
    name: "Saturday Session",
    gameMode: "doubles",
    courtFee: 50,
    gameRate: 20,
    courtCount: 2,
    playerCount: 6,
    totalBilled: 900,
    totalCollected: 300,
    createdAt: "2026-10-15T10:00:00Z",
    updatedAt: "2026-10-15T12:00:00Z",
    status: "live",
    startsAt: null,
    signupCount: 0,
    ...overrides,
  };
}

const routes = [
  { path: "/", element: <HomePage /> },
  { path: "/landing", element: <LandingPage /> },
  { path: "/queue/:queueId", element: <QueuePage /> },
  { path: "*", element: <ShowPath /> },
];

describe("queue pages", () => {
  // Block body: a function returned from beforeEach would run as cleanup.
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("home opens the most recently updated queue", async () => {
    listQueuesMock.mockResolvedValue([
      makeQueue({ id: "old", updatedAt: "2026-10-01T00:00:00Z" }),
      makeQueue({ id: "new", name: "Newest", updatedAt: "2026-10-15T00:00:00Z" }),
    ]);
    getQueueMock.mockResolvedValue(null);
    const { router } = renderApp(routes, "/");

    await screen.findByText("Queue not found");
    expect(router.state.location.pathname).toBe("/queue/new");
  });

  it("home shows the empty workspace when there are no queues", async () => {
    listQueuesMock.mockResolvedValue([]);
    renderApp(routes, "/");

    expect(await screen.findByText("No active queue yet")).toBeInTheDocument();
  });

  it("home shows a retry instead of an empty workspace when loading fails", async () => {
    listQueuesMock.mockRejectedValueOnce(new Error("offline"));
    renderApp(routes, "/");

    expect(await screen.findByText(/Could not load your queues/)).toBeInTheDocument();
    listQueuesMock.mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(await screen.findByText("No active queue yet")).toBeInTheDocument();
  });

  it("landing card shows collected and unpaid, not total billed (old bug #8)", async () => {
    listQueuesMock.mockResolvedValue([makeQueue()]);
    renderApp(routes, "/landing");

    const card = (await screen.findByRole("heading", { name: "Saturday Session" })).closest("article");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("₱300")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("₱600 unpaid")).toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText("₱900")).not.toBeInTheDocument();
  });

  it("landing card says 'All paid' when nothing is owed", async () => {
    listQueuesMock.mockResolvedValue([makeQueue({ totalBilled: 500, totalCollected: 500 })]);
    renderApp(routes, "/landing");

    expect(await screen.findByText("All paid")).toBeInTheDocument();
  });

  it("the whole landing card opens the queue", async () => {
    listQueuesMock.mockResolvedValue([makeQueue()]);
    getQueueMock.mockResolvedValue(null);
    const { router } = renderApp(routes, "/landing");

    fireEvent.click(await screen.findByRole("link", { name: "Saturday Session" }));
    await screen.findByText("Queue not found");
    expect(router.state.location.pathname).toBe("/queue/q1");
  });

  it("landing has the navbar and totals across all queues", async () => {
    listQueuesMock.mockResolvedValue([
      makeQueue({ id: "a", totalBilled: 900, totalCollected: 300 }),
      makeQueue({ id: "b", name: "Friday", totalBilled: 1200, totalCollected: 1000 }),
    ]);
    renderApp(routes, "/landing");

    expect(await screen.findByText("₱1,300")).toBeInTheDocument();
    expect(screen.getByText("₱800")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByText("All Queues")).toBeInTheDocument();
  });

  it("only shows search and sort once there are 6 or more queues", async () => {
    const five = Array.from({ length: 5 }, (_, index) => makeQueue({ id: `q${index}`, name: `Queue ${index}` }));
    listQueuesMock.mockResolvedValueOnce(five);
    renderApp(routes, "/landing");
    await screen.findByText("Queue 0");
    expect(screen.queryByRole("searchbox", { name: "Search queues" })).not.toBeInTheDocument();

    cleanup();
    listQueuesMock.mockResolvedValueOnce([...five, makeQueue({ id: "q5", name: "Queue 5" })]);
    renderApp(routes, "/landing");
    fireEvent.change(await screen.findByRole("searchbox", { name: "Search queues" }), { target: { value: "5" } });
    expect(screen.getByText("Queue 5")).toBeInTheDocument();
    expect(screen.queryByText("Queue 0")).not.toBeInTheDocument();
  });

  it("creates a queue and opens it", async () => {
    listQueuesMock.mockResolvedValue([]);
    createQueueMock.mockResolvedValue("created-id");
    getQueueMock.mockResolvedValue(null);
    const { router } = renderApp(routes, "/landing");

    fireEvent.click(await screen.findByRole("button", { name: "+ New Queue" }));
    fireEvent.change(screen.getByLabelText("Queue name"), { target: { value: " Friday Night " } });
    fireEvent.click(screen.getByRole("button", { name: /Singles/ }));
    fireEvent.change(screen.getByLabelText("Court fee"), { target: { value: "60" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create Queue" }));
    });

    expect(createQueueMock).toHaveBeenCalledWith({
      name: "Friday Night",
      gameMode: "singles",
      courtFee: 60,
      gameRate: 0,
    });
    // 2 courts is the default, so nothing else is saved.
    expect(updateQueueSettings).not.toHaveBeenCalled();
    await screen.findByText("Queue not found");
    expect(router.state.location.pathname).toBe("/queue/created-id");
  });

  it("sets the chosen number of courts on the new queue", async () => {
    listQueuesMock.mockResolvedValue([]);
    createQueueMock.mockResolvedValue("created-id");
    vi.mocked(updateQueueSettings).mockReset().mockResolvedValue({} as never);
    getQueueMock.mockResolvedValue(null);
    renderApp(routes, "/landing");

    fireEvent.click(await screen.findByRole("button", { name: "+ New Queue" }));
    fireEvent.change(screen.getByLabelText("Queue name"), { target: { value: "Big Night" } });
    const courts = screen.getByRole("group", { name: "Courts" });
    fireEvent.click(within(courts).getByRole("button", { name: "More courts" }));
    fireEvent.click(within(courts).getByRole("button", { name: "More courts" }));
    expect(within(courts).getByText("4")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create Queue" }));
    });

    expect(updateQueueSettings).toHaveBeenCalledWith("created-id", { courtCount: 4 });
  });

  it("plans a session for later: asks for the date, then opens sign-ups", async () => {
    listQueuesMock.mockResolvedValue([]);
    createQueueMock.mockResolvedValue("created-id");
    vi.mocked(setQueuePlan).mockReset().mockResolvedValue({} as never);
    getQueueMock.mockResolvedValue(null);
    renderApp(routes, "/landing");

    fireEvent.click(await screen.findByRole("button", { name: "+ New Queue" }));
    fireEvent.change(screen.getByLabelText("Queue name"), { target: { value: "Sat Open Play" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan for later" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create Queue" }));
    });
    // No date yet: the form says so and nothing is saved.
    expect(screen.getByText("Please pick the date and time")).toBeInTheDocument();
    expect(createQueueMock).not.toHaveBeenCalled();

    // Tap tomorrow, then ▲ on the clock's hour (it starts from 6:00 PM, so 7:00 PM).
    const tomorrowAt7 = new Date();
    tomorrowAt7.setDate(tomorrowAt7.getDate() + 1);
    tomorrowAt7.setHours(19, 0, 0, 0);
    const tomorrowLabel = tomorrowAt7.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });
    fireEvent.click(screen.getByRole("button", { name: tomorrowLabel }));
    fireEvent.click(screen.getByRole("button", { name: "Hour up" }));
    expect(screen.getByText(formatSessionDate(tomorrowAt7.toISOString()))).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create Queue" }));
    });

    expect(createQueueMock).toHaveBeenCalledWith({ name: "Sat Open Play", gameMode: "doubles", courtFee: 0, gameRate: 0 });
    expect(setQueuePlan).toHaveBeenCalledWith("created-id", tomorrowAt7.toISOString());
  });

  it("stays open on a click outside; closes with Cancel", async () => {
    listQueuesMock.mockResolvedValue([]);
    renderApp(routes, "/landing");

    fireEvent.click(await screen.findByRole("button", { name: "+ New Queue" }));
    const dialog = screen.getByRole("dialog", { name: "New Queue" });
    fireEvent.click(dialog.parentElement!);
    expect(screen.getByRole("dialog", { name: "New Queue" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "New Queue" })).not.toBeInTheDocument();
  });

  it("keeps the form open and explains decimal fees (old bug #5)", async () => {
    listQueuesMock.mockResolvedValue([]);
    renderApp(routes, "/landing");

    fireEvent.click(await screen.findByRole("button", { name: "+ New Queue" }));
    fireEvent.change(screen.getByLabelText("Queue name"), { target: { value: "Friday" } });
    fireEvent.change(screen.getByLabelText("Shuttle rate"), { target: { value: "12.5" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create Queue" }));
    });

    expect(screen.getByText("Use whole pesos only (no centavos)")).toBeInTheDocument();
    expect(createQueueMock).not.toHaveBeenCalled();
  });

  it("shows the database's message when create fails (old bug #7)", async () => {
    listQueuesMock.mockResolvedValue([]);
    createQueueMock.mockImplementation(async () => {
      throw { code: "P0001", message: "Billing values cannot be negative" };
    });
    renderApp(routes, "/landing");

    fireEvent.click(await screen.findByRole("button", { name: "+ New Queue" }));
    fireEvent.change(screen.getByLabelText("Queue name"), { target: { value: "Friday" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create Queue" }));
    });

    expect(await screen.findByText("Billing values cannot be negative")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("navbar queue list: latest first, no search, delete from the ⋯ menu", async () => {
    listQueuesMock.mockResolvedValue([
      makeQueue({ id: "old", name: "Old Night", updatedAt: "2026-10-01T10:00:00Z" }),
      makeQueue({ id: "new", name: "New Night", updatedAt: "2026-10-20T10:00:00Z" }),
    ]);
    renderApp(routes, "/landing");

    fireEvent.click(await screen.findByRole("button", { name: "Queues: show queue list" }));
    const panel = screen.getByRole("heading", { name: "Queues" }).closest(".queue-list-panel") as HTMLElement;
    const rows = within(panel).getAllByRole("listitem");
    expect(rows.map((row) => within(row).getAllByRole("button")[0].textContent)).toEqual([
      expect.stringContaining("New Night"),
      expect.stringContaining("Old Night"),
    ]);
    expect(within(panel).queryByRole("searchbox")).not.toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "See all queues →" })).toHaveAttribute("href", "/landing");

    fireEvent.click(within(panel).getByRole("button", { name: "More actions for Old Night" }));
    fireEvent.click(within(panel).getByRole("menuitem", { name: "Delete queue" }));
    expect(screen.getByText('Delete "Old Night"? This cannot be undone.')).toBeInTheDocument();
  });

  it("More menu: display group on a queue, only Log out on the landing page", async () => {
    listQueuesMock.mockResolvedValue([makeQueue()]);
    getQueueMock.mockResolvedValue({
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
      version: 1,
      created_at: "2026-10-20T00:00:00Z",
      updated_at: "2026-10-20T00:00:00Z",
    });
    renderApp(routes, "/queue/q1");

    fireEvent.click(await screen.findByRole("button", { name: "More: open shortcuts" }));
    const display = screen.getByRole("group", { name: "Public display" });
    expect(within(display).getByRole("link", { name: /Open display/ })).toHaveAttribute("href", "/queue/q1/display");
    expect(within(display).getByRole("button", { name: "Show QR code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(screen.queryByText("Landing")).not.toBeInTheDocument();

    cleanup();
    renderApp(routes, "/landing");
    fireEvent.click(await screen.findByRole("button", { name: "More: open shortcuts" }));
    expect(screen.queryByRole("group", { name: "Public display" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("renames a queue from its card menu", async () => {
    listQueuesMock.mockResolvedValue([makeQueue()]);
    vi.mocked(renameQueue).mockReset().mockResolvedValue({} as never);
    renderApp(routes, "/landing");

    fireEvent.click(await screen.findByRole("button", { name: "More actions for Saturday Session" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename queue" }));
    const dialog = screen.getByRole("dialog", { name: "Rename queue" });
    fireEvent.change(within(dialog).getByLabelText("Queue name"), { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText("Please enter a queue name")).toBeInTheDocument();
    expect(renameQueue).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText("Queue name"), { target: { value: " Sunday Smash " } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    });

    expect(renameQueue).toHaveBeenCalledWith("q1", "Sunday Smash");
    expect(await screen.findByText("Queue renamed")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Rename queue" })).not.toBeInTheDocument();
  });

  it("edits a planned session's name, date and time from its card menu", async () => {
    listQueuesMock.mockResolvedValue([makeQueue({ name: "Rosario", status: "planned", startsAt: "2026-10-21T09:30:00Z", signupCount: 10 })]);
    vi.mocked(renameQueue).mockReset().mockResolvedValue({} as never);
    renderApp(routes, "/landing");

    expect(await screen.findByText("10 going")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More actions for Rosario" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit name, date & time" }));
    const dialog = screen.getByRole("dialog", { name: "Edit session" });
    expect(within(dialog).getByLabelText("Queue name")).toHaveValue("Rosario");
    // The saved date and time are shown (and picked) when the dialog opens.
    expect(within(dialog).getByText(formatSessionDate("2026-10-21T09:30:00Z"))).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Queue name"), { target: { value: "Rosario Court" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    });

    expect(renameQueue).toHaveBeenCalledWith("q1", "Rosario Court");
    // The date didn't change, so it isn't saved again.
    expect(setQueuePlan).not.toHaveBeenCalled();
  });

  it("deletes a queue after confirming", async () => {
    listQueuesMock.mockResolvedValueOnce([makeQueue()]).mockResolvedValue([]);
    deleteQueueMock.mockResolvedValue();
    renderApp(routes, "/landing");

    fireEvent.click(await screen.findByRole("button", { name: "More actions for Saturday Session" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete queue" }));
    expect(screen.getByText('Delete "Saturday Session"? This cannot be undone.')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete Queue" }));
    });

    expect(deleteQueueMock).toHaveBeenCalledWith("q1");
    expect(await screen.findByText("No queues yet")).toBeInTheDocument();
  });

  it("queue page says 'not found' for a queue you can't see", async () => {
    getQueueMock.mockResolvedValue(null);
    renderApp(routes, "/queue/someone-elses");

    expect(await screen.findByText("Queue not found")).toBeInTheDocument();
  });

  it("queue page shows the queue name with the navbar", async () => {
    getQueueMock.mockResolvedValue({
      id: "q1",
      owner_id: "u1",
      status: "live",
      starts_at: null,
      name: "Saturday Session",
      game_mode: "singles",
      court_fee: 50,
      game_rate: 20,
      court_count: 2,
      match_no: 0,
      version: 0,
      created_at: "2026-10-15T10:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    });
    renderApp(routes, "/queue/q1");

    expect(await screen.findByRole("heading", { name: "Saturday Session" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });
});
