import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QueuePage } from "@/pages/queue-page";
import {
  addAdjustment,
  addSharedFee,
  listBillingPlayers,
  listLedger,
  recordBulkPayment,
  recordPayment,
  reverseLatestPayment,
  type LedgerEntry,
} from "@/services/billing";
import type { Player } from "@/services/players";
import { getQueue, type Queue } from "@/services/queues";
import { renderApp } from "@/test/render-app";

// Never talk to the real Supabase in tests.
vi.mock("@/services/queues", () => ({ getQueue: vi.fn(), listQueues: vi.fn(async () => []) }));
vi.mock("@/services/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/services/players", () => ({
  listPlayers: vi.fn(async () => []),
  listPlayerBilledTotals: vi.fn(async () => new Map()),
}));
vi.mock("@/services/matches", () => ({
  listActiveMatches: vi.fn(async () => []),
  listMatchHistory: vi.fn(async () => ({ entries: [], total: 0 })),
}));
vi.mock("@/services/billing", () => ({
  listLedger: vi.fn(),
  listBillingPlayers: vi.fn(),
  recordPayment: vi.fn(),
  recordBulkPayment: vi.fn(),
  reverseLatestPayment: vi.fn(),
  addAdjustment: vi.fn(),
  addSharedFee: vi.fn(),
}));

const queue: Queue = {
  id: "q1",
  owner_id: "u1",
  status: "live",
  starts_at: null,
  name: "Saturday Session",
  game_mode: "doubles",
  court_fee: 100,
  game_rate: 30,
  court_count: 2,
  match_no: 0,
  version: 3,
  created_at: "2026-10-24T00:00:00Z",
  updated_at: "2026-10-24T00:00:00Z",
};

function makePlayer(id: number, name: string, extra: Partial<Player> = {}): Player {
  return {
    id,
    queue_id: "q1",
    name,
    skill: "intermediate",
    games_played: 0,
    queue_position: id,
    is_playing: false,
    is_waiting_match: false,
    is_paused: false,
    rest_games_needed: 0,
    last_match_no: 0,
    leave_code_hash: null,
    created_at: "2026-10-24T00:00:00Z",
    removed_at: null,
    ...extra,
  };
}

function charge(id: number, playerId: number, name: string, amount: number, type: LedgerEntry["entry_type"] = "court_fee"): LedgerEntry {
  return {
    id,
    queue_id: "q1",
    player_id: playerId,
    player_name: name,
    amount,
    entry_type: type,
    note: type === "payment" ? "Marked as paid" : "Initial court fee",
    payment_method: type === "payment" ? "cash" : null,
    payment_reference: null,
    match_no: null,
    created_at: "2026-10-24T00:00:00Z",
  };
}

const players = [makePlayer(1, "Ana"), makePlayer(2, "Ben"), makePlayer(3, "Gone", { removed_at: "2026-10-24T02:00:00Z" })];
const ledger = [
  charge(1, 1, "Ana", 100),
  charge(2, 2, "Ben", 100),
  charge(3, 3, "Gone", 100),
  charge(4, 2, "Ben", 100, "payment"),
];

const routes = [{ path: "/queue/:queueId", element: <QueuePage /> }];

async function openBilling() {
  renderApp(routes, "/queue/q1");
  fireEvent.click(await screen.findByRole("button", { name: "Billing" }));
  await screen.findByText("Billing workspace");
}

describe("Billing tab", () => {
  // Block body: a function returned from beforeEach would run as cleanup.
  beforeEach(() => {
    vi.mocked(getQueue).mockReset().mockResolvedValue(queue);
    vi.mocked(listBillingPlayers).mockReset().mockResolvedValue(players);
    vi.mocked(listLedger).mockReset().mockResolvedValue(ledger);
    for (const action of [recordPayment, recordBulkPayment, reverseLatestPayment, addAdjustment, addSharedFee]) {
      vi.mocked(action).mockReset().mockResolvedValue();
    }
  });

  it("shows the summary cards and keeps a removed player's debt (old bug #2)", async () => {
    await openBilling();

    expect(screen.getByText("Open Balance").nextElementSibling).toHaveTextContent("₱200");
    expect(screen.getByText("Collected").nextElementSibling).toHaveTextContent("₱100");
    expect(screen.getByText("Players Due").nextElementSibling).toHaveTextContent("2");

    const unpaid = screen.getByRole("rowgroup", { name: "Unpaid" });
    expect(within(unpaid).getByText("Gone")).toBeInTheDocument();
    expect(within(unpaid).getByText("Removed")).toBeInTheDocument();
    expect(within(screen.getByRole("rowgroup", { name: "Paid / cleared" })).getByText("Ben")).toBeInTheDocument();
  });

  it("marks a player paid with method and reference", async () => {
    await openBilling();

    fireEvent.click(screen.getByRole("button", { name: "Mark Ana paid" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm payment" });
    expect(within(dialog).getByText("Mark Ana as paid for ₱100?")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Payment method"), { target: { value: "gcash" } });
    fireEvent.change(within(dialog).getByLabelText("Reference"), { target: { value: " 12345 " } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Confirm payment" }));
    });

    expect(recordPayment).toHaveBeenCalledWith("q1", { playerId: 1, paymentMethod: "gcash", paymentReference: "12345" });
    expect(await screen.findByText("Player marked as paid")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Confirm payment" })).not.toBeInTheDocument();
  });

  it("keeps the dialog open with the database message when saving fails", async () => {
    vi.mocked(recordPayment).mockRejectedValue({ code: "P0001", message: "Player has no unpaid balance" });
    await openBilling();

    fireEvent.click(screen.getByRole("button", { name: "Mark Ana paid" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm payment" }));
    });

    expect(await screen.findByText("Player has no unpaid balance")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Confirm payment" })).toBeInTheDocument();
  });

  it("records a partial payment and refuses more than the balance", async () => {
    await openBilling();

    fireEvent.click(screen.getByRole("button", { name: "Partial payment for Ana" }));
    const dialog = screen.getByRole("dialog", { name: "Partial payment" });
    const amount = within(dialog).getByLabelText(/Partial payment amount/);
    const save = within(dialog).getByRole("button", { name: "Save partial payment" });

    fireEvent.change(amount, { target: { value: "150" } });
    expect(within(dialog).getByText("Payment amount exceeds remaining balance")).toBeInTheDocument();
    expect(save).toBeDisabled();

    fireEvent.change(amount, { target: { value: "40" } });
    expect(within(dialog).getByText("Remaining after payment: ₱60")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(save);
    });
    expect(recordPayment).toHaveBeenCalledWith("q1", {
      playerId: 1,
      note: "Partial payment",
      amount: 40,
      paymentMethod: "cash",
      paymentReference: undefined,
    });
  });

  it("undoes the latest payment after confirming", async () => {
    await openBilling();

    fireEvent.click(screen.getByRole("button", { name: "Undo Ben's last payment" }));
    const dialog = screen.getByRole("dialog", { name: "Undo payment" });
    expect(within(dialog).getByText("Restore Ben's unpaid balance for ₱100?")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Undo payment" }));
    });

    expect(reverseLatestPayment).toHaveBeenCalledWith("q1", 2);
    expect(await screen.findByText("Payment reverted")).toBeInTheDocument();
  });

  it("marks several players paid at once", async () => {
    await openBilling();

    fireEvent.click(screen.getByRole("button", { name: "Select visible" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark selected paid" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm bulk payment" });
    expect(within(dialog).getByText("Mark 2 selected players as paid for ₱200?")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Confirm bulk payment" }));
    });

    expect(recordBulkPayment).toHaveBeenCalledWith("q1", { playerIds: [1, 3], paymentMethod: "cash", paymentReference: undefined });
    expect(await screen.findByText("Marked 2 players as paid")).toBeInTheDocument();
  });

  it("saves a one-player adjustment and a shared fee from Advanced tools", async () => {
    await openBilling();

    fireEvent.click(screen.getByRole("button", { name: /Tools/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Advanced tools/ }));
    const dialog = screen.getByRole("dialog", { name: "Advanced billing tools" });

    const save = within(dialog).getByRole("button", { name: "Save adjustment" });
    fireEvent.change(within(dialog).getByLabelText("Adjustment amount"), { target: { value: "-20" } });
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Adjustment note"), { target: { value: "Refund" } });
    await act(async () => {
      fireEvent.click(save);
    });
    expect(addAdjustment).toHaveBeenCalledWith("q1", { playerId: 1, amount: -20, note: "Refund" });
    expect(await screen.findByText("Billing adjustment saved")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Split fee" }));
    fireEvent.change(within(dialog).getByLabelText("Shared fee amount"), { target: { value: "101" } });
    fireEvent.change(within(dialog).getByLabelText("Shared fee note"), { target: { value: "Shuttle tube" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Select visible" }));
    expect(within(dialog).getByText("1 x ₱51 • 1 x ₱50")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save shared fee" }));
    });
    // Removed players can't be picked for a shared fee.
    expect(addSharedFee).toHaveBeenCalledWith("q1", { playerIds: [1, 2], totalAmount: 101, note: "Shuttle tube" });
    expect(await screen.findByText("Shared fee saved for 2 players")).toBeInTheDocument();
  });

  it("searches the payment activity", async () => {
    await openBilling();

    fireEvent.click(screen.getByRole("button", { name: /Tools/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Payment activity/ }));
    const dialog = screen.getByRole("dialog", { name: "Payment activity" });
    expect(within(dialog).getByText("4 records")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Search activity"), { target: { value: "payment" } });
    expect(await within(dialog).findByText("1 of 4")).toBeInTheDocument();
  });
});
