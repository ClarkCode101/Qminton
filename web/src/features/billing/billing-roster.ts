import { SKILL_LABELS } from "@/features/players/player-status";
import { formatCurrency } from "@/lib/format";
import type { LedgerEntry, PaymentMethod } from "@/services/billing";
import type { Player } from "@/services/players";

// Billing math and lists, ported from the old BillingView.tsx.
// Every total comes from the ledger, so it always matches the database.

export type RosterFilter = "all" | "paid" | "partial" | "unpaid";
export type RosterGroup = "unpaid" | "partial" | "paid";
export type RosterSort = "highest-balance" | "most-games" | "largest-extra" | "name";

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
  { value: "bank", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash: "GCash",
  maya: "Maya",
  bank: "Bank transfer",
  other: "Other",
};

const ENTRY_TYPE_LABELS: Record<LedgerEntry["entry_type"], string> = {
  court_fee: "Court fee",
  game_rate: "Game fee",
  adjustment: "Adjustment",
  payment: "Payment",
};

export function entryTypeLabel(entry: LedgerEntry): string {
  return entry.entry_type === "payment" && entry.amount < 0 ? "Payment reversal" : ENTRY_TYPE_LABELS[entry.entry_type];
}

export interface BillingStatus {
  label: string;
  className: string;
}

// Same labels as the old Billing tab, plus "Removed" for players who left with a billing record.
export function getBillingPlayerStatus(player: Player): BillingStatus {
  if (player.removed_at) return { label: "Removed", className: "border-slate-200 bg-slate-100 text-slate-500" };
  if (player.is_playing) return { label: "On court", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (player.is_paused) return { label: "Paused", className: "border-amber-200 bg-amber-50 text-amber-700" };
  if (player.is_waiting_match) return { label: "Queued", className: "border-blue-200 bg-blue-50 text-blue-700" };
  return { label: "Ready", className: "border-slate-200 bg-slate-50 text-slate-600" };
}

export interface RosterRow {
  player: Player;
  status: BillingStatus;
  skillLabel: string;
  courtFeeTotal: number;
  shuttleTotal: number;
  extras: number;
  billedTotal: number;
  paymentTotal: number;
  outstandingBalance: number;
  // The payment "Undo" would reverse (0 when there is none).
  latestReversiblePaymentAmount: number;
  latestPaymentMethod: PaymentMethod | null;
  latestPaymentReference: string | null;
}

// Old stack rule: walk payments oldest first; a payment is pushed, an undo
// (negative payment) pops the last one. The top is what "Undo" reverses next.
export function getLatestReversiblePayment(entries: LedgerEntry[], playerId: number): LedgerEntry | null {
  const open: LedgerEntry[] = [];
  const payments = entries
    .filter((entry) => entry.player_id === playerId && entry.entry_type === "payment")
    .sort((left, right) => left.id - right.id);
  for (const entry of payments) {
    if (entry.amount > 0) open.push(entry);
    else if (entry.amount < 0) open.pop();
  }
  return open.at(-1) ?? null;
}

// One row per player. Removed players are kept only if they have a billing record.
export function buildRosterRows(players: Player[], ledger: LedgerEntry[]): RosterRow[] {
  const entriesByPlayer = new Map<number, LedgerEntry[]>();
  for (const entry of ledger) {
    const list = entriesByPlayer.get(entry.player_id) ?? [];
    list.push(entry);
    entriesByPlayer.set(entry.player_id, list);
  }

  return players
    .filter((player) => !player.removed_at || entriesByPlayer.has(player.id))
    .map((player) => {
      const entries = entriesByPlayer.get(player.id) ?? [];
      const sum = (type: LedgerEntry["entry_type"]) =>
        entries.filter((entry) => entry.entry_type === type).reduce((total, entry) => total + entry.amount, 0);
      const courtFeeTotal = sum("court_fee");
      const shuttleTotal = sum("game_rate");
      const extras = sum("adjustment");
      const paymentTotal = sum("payment");
      const billedTotal = courtFeeTotal + shuttleTotal + extras;
      const latest = getLatestReversiblePayment(entries, player.id);

      return {
        player,
        status: getBillingPlayerStatus(player),
        skillLabel: SKILL_LABELS[player.skill],
        courtFeeTotal,
        shuttleTotal,
        extras,
        billedTotal,
        paymentTotal,
        outstandingBalance: billedTotal - paymentTotal,
        latestReversiblePaymentAmount: latest?.amount ?? 0,
        latestPaymentMethod: latest?.payment_method ?? null,
        latestPaymentReference: latest?.payment_reference ?? null,
      };
    });
}

export function getRosterGroup(row: RosterRow): RosterGroup {
  if (row.outstandingBalance > 0 && row.paymentTotal > 0) return "partial";
  if (row.outstandingBalance > 0) return "unpaid";
  return "paid";
}

function matchesFilter(row: RosterRow, filter: RosterFilter): boolean {
  if (filter === "paid") return row.paymentTotal > 0 && row.outstandingBalance <= 0;
  if (filter === "partial") return row.paymentTotal > 0 && row.outstandingBalance > 0;
  if (filter === "unpaid") return row.outstandingBalance > 0;
  return true;
}

export function countRosterFilters(rows: RosterRow[]): Record<RosterFilter, number> {
  return {
    all: rows.length,
    paid: rows.filter((row) => matchesFilter(row, "paid")).length,
    partial: rows.filter((row) => matchesFilter(row, "partial")).length,
    unpaid: rows.filter((row) => matchesFilter(row, "unpaid")).length,
  };
}

export function getVisibleRosterRows(rows: RosterRow[], search: string, filter: RosterFilter, sort: RosterSort): RosterRow[] {
  const query = search.trim().toLowerCase();
  return rows
    .filter((row) => matchesFilter(row, filter))
    .filter((row) => !query || [row.player.name, row.status.label, row.skillLabel].join(" ").toLowerCase().includes(query))
    .sort((left, right) => {
      const byName = left.player.name.localeCompare(right.player.name);
      if (sort === "name") return byName;
      if (sort === "most-games") return right.player.games_played - left.player.games_played || byName;
      if (sort === "largest-extra") return right.extras - left.extras || right.billedTotal - left.billedTotal;
      return right.outstandingBalance - left.outstandingBalance || right.billedTotal - left.billedTotal || byName;
    });
}

export interface BillingTotals {
  outstandingTotal: number;
  collectedTotal: number;
  billedTotal: number;
  unpaidCount: number;
  fullyPaidCount: number;
  partialCount: number;
}

export function getBillingTotals(rows: RosterRow[], ledger: LedgerEntry[]): BillingTotals {
  const counts = countRosterFilters(rows);
  return {
    outstandingTotal: rows.reduce((total, row) => total + row.outstandingBalance, 0),
    collectedTotal: ledger.filter((entry) => entry.entry_type === "payment").reduce((total, entry) => total + entry.amount, 0),
    billedTotal: ledger.filter((entry) => entry.entry_type !== "payment").reduce((total, entry) => total + entry.amount, 0),
    unpaidCount: counts.unpaid,
    fullyPaidCount: counts.paid,
    partialCount: counts.partial,
  };
}

// Old splitAmountEvenly: leftover pesos go to the first players (100 / 3 = 34, 33, 33).
export function splitAmountEvenly(totalAmount: number, parts: number): number[] {
  if (parts <= 0 || totalAmount === 0) return [];
  const sign = totalAmount >= 0 ? 1 : -1;
  const absoluteTotal = Math.abs(totalAmount);
  const baseShare = Math.floor(absoluteTotal / parts);
  const remainder = absoluteTotal % parts;
  return Array.from({ length: parts }, (_, index) => sign * (baseShare + (index < remainder ? 1 : 0)));
}

export function formatSharePreview(shares: number[]): string {
  if (shares.length === 0) return "Select players to preview the split.";
  const counts = new Map<number, number>();
  for (const share of shares) counts.set(share, (counts.get(share) ?? 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => right[0] - left[0])
    .map(([share, count]) => `${count} x ${formatCurrency(share)}`)
    .join(" • ");
}

export function searchLedger(ledger: LedgerEntry[], search: string): LedgerEntry[] {
  const query = search.trim().toLowerCase();
  if (!query) return ledger;
  return ledger.filter((entry) =>
    [entry.player_name, entry.note, entryTypeLabel(entry), entry.match_no === null ? "" : `match ${entry.match_no}`]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
}

// Old csvEscape, plus a guard against spreadsheet formulas: text starting with
// = + - @ (or a tab / carriage return) gets a leading ' so Excel shows it as text.
export function csvEscape(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  text = text.replace(/"/g, '""');
  return /[",\n\r]/.test(text) ? `"${text}"` : text;
}

export function buildBillingCsv(rows: RosterRow[]): string {
  const header = ["Player", "Status", "Games", "Court Fee", "Shuttle", "Extras", "Billed", "Paid", "Outstanding", "Payment Method", "Reference"];
  const lines = [...rows]
    .sort((left, right) => left.player.name.localeCompare(right.player.name))
    .map((row) => [
      row.player.name,
      row.outstandingBalance <= 0 ? "Paid" : row.paymentTotal > 0 ? "Partial" : "Unpaid",
      row.player.games_played,
      row.courtFeeTotal,
      row.shuttleTotal,
      row.extras,
      row.billedTotal,
      row.paymentTotal,
      row.outstandingBalance,
      row.latestPaymentMethod ? PAYMENT_METHOD_LABELS[row.latestPaymentMethod] : "",
      row.latestPaymentReference ?? "",
    ]);
  return [header, ...lines].map((line) => line.map(csvEscape).join(",")).join("\n");
}

// Same file name as the old app: billing-summary-YYYY-MM-DD.csv
export function billingCsvFileName(now: Date = new Date()): string {
  return `billing-summary-${now.toISOString().slice(0, 10)}.csv`;
}

export function buildBillingSummaryText(rows: RosterRow[], totals: BillingTotals): string {
  const openRows = rows
    .filter((row) => row.outstandingBalance > 0)
    .sort((left, right) => right.outstandingBalance - left.outstandingBalance || left.player.name.localeCompare(right.player.name));

  return [
    "Billing summary",
    `Outstanding Total: ${formatCurrency(totals.outstandingTotal)}`,
    `Collected Total: ${formatCurrency(totals.collectedTotal)}`,
    `Unpaid Players: ${totals.unpaidCount}`,
    `Paid in Full: ${totals.fullyPaidCount}`,
    totals.partialCount > 0 ? `Partial Payments: ${totals.partialCount}` : null,
    "",
    openRows.length > 0 ? "Open balances:" : "All balances cleared.",
    ...openRows.map(
      (row) =>
        `${row.player.name}: ${formatCurrency(row.outstandingBalance)}` +
        (row.paymentTotal > 0 ? ` (Paid ${formatCurrency(row.paymentTotal)})` : ""),
    ),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
