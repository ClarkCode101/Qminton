import { describe, expect, it } from "vitest";

import { isValid, partialPaymentSchema, signedAmountSchema, fieldError } from "@/features/billing/billing-form-schema";
import {
  buildBillingCsv,
  buildBillingSummaryText,
  buildRosterRows,
  countRosterFilters,
  csvEscape,
  formatSharePreview,
  getBillingTotals,
  getLatestReversiblePayment,
  getVisibleRosterRows,
  searchLedger,
  splitAmountEvenly,
} from "@/features/billing/billing-roster";
import type { LedgerEntry } from "@/services/billing";
import type { Player } from "@/services/players";

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

let nextId = 1;
function entry(playerId: number, amount: number, type: LedgerEntry["entry_type"], extra: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: nextId++,
    queue_id: "q1",
    player_id: playerId,
    player_name: `P${playerId}`,
    amount,
    entry_type: type,
    note: type === "payment" ? "Marked as paid" : "Initial court fee",
    payment_method: null,
    payment_reference: null,
    match_no: null,
    created_at: "2026-10-24T00:00:00Z",
    ...extra,
  };
}

describe("splitAmountEvenly (old _split_amount_evenly)", () => {
  it("gives leftover pesos to the first players", () => {
    expect(splitAmountEvenly(100, 3)).toEqual([34, 33, 33]);
    expect(splitAmountEvenly(-10, 3)).toEqual([-4, -3, -3]);
    expect(splitAmountEvenly(2, 3)).toEqual([1, 1, 0]);
  });

  it("returns nothing with no players or no amount", () => {
    expect(splitAmountEvenly(100, 0)).toEqual([]);
    expect(splitAmountEvenly(0, 3)).toEqual([]);
  });

  it("previews the split like the old app", () => {
    expect(formatSharePreview([34, 33, 33])).toBe("1 x ₱34 • 2 x ₱33");
    expect(formatSharePreview([])).toBe("Select players to preview the split.");
  });
});

describe("undo stack (old _latest_reversible_payment_entry)", () => {
  it("undoes the newest payment first, then the one before", () => {
    const first = entry(1, 40, "payment", { note: "Partial payment" });
    const second = entry(1, 60, "payment");
    expect(getLatestReversiblePayment([first, second], 1)).toBe(second);

    const undoSecond = entry(1, -60, "payment");
    expect(getLatestReversiblePayment([first, second, undoSecond], 1)).toBe(first);

    const undoFirst = entry(1, -40, "payment");
    expect(getLatestReversiblePayment([first, second, undoSecond, undoFirst], 1)).toBeNull();
  });
});

describe("roster rows", () => {
  const ana = makePlayer(1, "Ana", { games_played: 3 });
  const ben = makePlayer(2, "Ben", { games_played: 1 });
  const cy = makePlayer(3, "Cy");
  const gone = makePlayer(4, "Gone", { removed_at: "2026-10-24T01:00:00Z" });
  const goneClean = makePlayer(5, "Never billed", { removed_at: "2026-10-24T01:00:00Z" });
  const ledger = [
    entry(1, 100, "court_fee"),
    entry(1, 90, "game_rate"),
    entry(1, 20, "adjustment"),
    entry(1, 50, "payment", { payment_method: "gcash", payment_reference: "REF-1" }),
    entry(2, 100, "court_fee"),
    entry(2, 30, "game_rate"),
    entry(2, 130, "payment"),
    entry(3, 100, "court_fee"),
    entry(4, 100, "court_fee"),
  ];
  const rows = buildRosterRows([ana, ben, cy, gone, goneClean], ledger);

  it("computes totals from the ledger and keeps removed players who still owe", () => {
    expect(rows.map((row) => row.player.name)).toEqual(["Ana", "Ben", "Cy", "Gone"]);
    const anaRow = rows[0];
    expect(anaRow).toMatchObject({
      courtFeeTotal: 100,
      shuttleTotal: 90,
      extras: 20,
      billedTotal: 210,
      paymentTotal: 50,
      outstandingBalance: 160,
      latestReversiblePaymentAmount: 50,
      latestPaymentMethod: "gcash",
      latestPaymentReference: "REF-1",
    });
    expect(rows[3].status.label).toBe("Removed");
  });

  it("counts filters and totals like the old summary cards", () => {
    expect(countRosterFilters(rows)).toEqual({ all: 4, paid: 1, partial: 1, unpaid: 3 });
    expect(getBillingTotals(rows, ledger)).toEqual({
      outstandingTotal: 360,
      collectedTotal: 180,
      billedTotal: 540,
      unpaidCount: 3,
      fullyPaidCount: 1,
      partialCount: 1,
    });
  });

  it("filters, searches and sorts", () => {
    const names = (list: typeof rows) => list.map((row) => row.player.name);
    expect(names(getVisibleRosterRows(rows, "", "all", "highest-balance"))).toEqual(["Ana", "Cy", "Gone", "Ben"]);
    expect(names(getVisibleRosterRows(rows, "", "all", "most-games"))).toEqual(["Ana", "Ben", "Cy", "Gone"]);
    expect(names(getVisibleRosterRows(rows, "", "paid", "name"))).toEqual(["Ben"]);
    expect(names(getVisibleRosterRows(rows, "", "partial", "name"))).toEqual(["Ana"]);
    expect(names(getVisibleRosterRows(rows, "removed", "all", "name"))).toEqual(["Gone"]);
  });

  it("builds the share text with open balances", () => {
    const text = buildBillingSummaryText(rows, getBillingTotals(rows, ledger));
    expect(text).toContain("Outstanding Total: ₱360");
    expect(text).toContain("Partial Payments: 1");
    expect(text).toContain("Ana: ₱160 (Paid ₱50)");
  });

  it("exports CSV sorted by name", () => {
    const lines = buildBillingCsv(rows).split("\n");
    expect(lines[0]).toBe("Player,Status,Games,Court Fee,Shuttle,Extras,Billed,Paid,Outstanding,Payment Method,Reference");
    expect(lines[1]).toBe("Ana,Partial,3,100,90,20,210,50,160,GCash,REF-1");
    expect(lines[2]).toBe("Ben,Paid,1,100,30,0,130,130,0,,");
  });
});

describe("csvEscape", () => {
  it("quotes commas and quotes like the old app", () => {
    expect(csvEscape('Dela Cruz, "JR"')).toBe('"Dela Cruz, ""JR"""');
    expect(csvEscape(-20)).toBe("-20");
  });

  it("stops names from running as spreadsheet formulas", () => {
    expect(csvEscape("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvEscape("+63")).toBe("'+63");
    expect(csvEscape("-Ana")).toBe("'-Ana");
    expect(csvEscape("@me")).toBe("'@me");
  });
});

describe("searchLedger", () => {
  it("finds by player, note, type label and match number", () => {
    const ledger = [
      entry(1, 30, "game_rate", { player_name: "Ana", note: "Game fee", match_no: 7 }),
      entry(2, -50, "payment", { player_name: "Ben", note: "Reversed payment: Marked as paid" }),
    ];
    expect(searchLedger(ledger, "match 7")).toHaveLength(1);
    expect(searchLedger(ledger, "payment reversal")[0].player_name).toBe("Ben");
    expect(searchLedger(ledger, "")).toHaveLength(2);
  });
});

describe("billing amounts", () => {
  it("accepts whole pesos, + or -, not zero", () => {
    expect(isValid(signedAmountSchema, "-20")).toBe(true);
    expect(isValid(signedAmountSchema, "0")).toBe(false);
    expect(fieldError(signedAmountSchema, "0")).toBeNull();
    expect(fieldError(signedAmountSchema, "12.5")).toBe("Use whole pesos only (no centavos)");
    expect(fieldError(signedAmountSchema, "100001")).toBe("Amount must be 100,000 or less");
  });

  it("limits a partial payment to the balance", () => {
    const schema = partialPaymentSchema(160);
    expect(isValid(schema, "160")).toBe(true);
    expect(fieldError(schema, "161")).toBe("Payment amount exceeds remaining balance");
    expect(fieldError(schema, "0")).toBe("Payment amount must be greater than zero");
  });
});
