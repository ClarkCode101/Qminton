import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QueuePage } from "@/pages/queue-page";
import { getQueue, updateQueueSettings, type Queue } from "@/services/queues";
import { renderApp } from "@/test/render-app";

// Never talk to the real Supabase in tests.
vi.mock("@/services/queues", () => ({
  getQueue: vi.fn(),
  listQueues: vi.fn(async () => []),
  updateQueueSettings: vi.fn(),
}));
vi.mock("@/services/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/services/billing", () => ({ listLedger: vi.fn(async () => []), listBillingPlayers: vi.fn(async () => []) }));
vi.mock("@/services/matches", () => ({ listActiveMatches: vi.fn(async () => []), listMatchHistory: vi.fn(async () => ({ entries: [], total: 0 })) }));
vi.mock("@/services/players", () => ({
  listPlayers: vi.fn(async () => []),
}));

function makeQueue(overrides: Partial<Queue> = {}): Queue {
  return {
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
    created_at: "2026-10-21T00:00:00Z",
    updated_at: "2026-10-21T00:00:00Z",
    ...overrides,
  };
}

const routes = [{ path: "/queue/:queueId", element: <QueuePage /> }];

describe("queue settings", () => {
  // Block body: a function returned from beforeEach would run as cleanup.
  beforeEach(() => {
    vi.mocked(getQueue).mockReset().mockResolvedValue(makeQueue());
    vi.mocked(updateQueueSettings).mockReset();
  });

  it("adds a court", async () => {
    vi.mocked(updateQueueSettings).mockResolvedValue(makeQueue({ court_count: 3 }));
    renderApp(routes, "/queue/q1");

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Increase court count" }));
    });

    expect(updateQueueSettings).toHaveBeenCalledWith("q1", { courtCount: 3 });
    expect(await screen.findByText("Courts updated")).toBeInTheDocument();
  });

  it("can't go below 1 or above 6 courts", async () => {
    vi.mocked(getQueue).mockResolvedValue(makeQueue({ court_count: 1 }));
    renderApp(routes, "/queue/q1");
    expect(await screen.findByRole("button", { name: "Decrease court count" })).toBeDisabled();
  });

  it("shows a readable error when the change fails (old bug #7)", async () => {
    vi.mocked(updateQueueSettings).mockImplementation(async () => {
      throw { code: "P0001", message: "Queue not found" };
    });
    renderApp(routes, "/queue/q1");

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Decrease court count" }));
    });

    expect(await screen.findByText("Queue not found")).toBeInTheDocument();
  });

  it("saves the billing setup with whole pesos only", async () => {
    vi.mocked(updateQueueSettings).mockResolvedValue(makeQueue({ court_fee: 80, game_rate: 30 }));
    renderApp(routes, "/queue/q1");

    fireEvent.click(await screen.findByRole("button", { name: "Billing" }));
    fireEvent.click(await screen.findByRole("button", { name: /Tools/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Billing setup/ }));
    const dialog = screen.getByRole("dialog", { name: "Billing setup" });
    const courtFee = within(dialog).getByLabelText("Court Fee per Player (₱)");
    const gameRate = within(dialog).getByLabelText("Shuttle Rate per Game (₱)");
    expect(courtFee).toHaveValue("50");

    fireEvent.change(gameRate, { target: { value: "12.5" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save Billing" }));
    });
    expect(within(dialog).getByText("Use whole pesos only (no centavos)")).toBeInTheDocument();
    expect(updateQueueSettings).not.toHaveBeenCalled();

    fireEvent.change(courtFee, { target: { value: "80" } });
    fireEvent.change(gameRate, { target: { value: "30" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save Billing" }));
    });
    expect(updateQueueSettings).toHaveBeenCalledWith("q1", { courtFee: 80, gameRate: 30 });
    expect(within(dialog).getByText("Billing setup saved.")).toBeInTheDocument();
  });
});
