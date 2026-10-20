import { getRosterGroup, PAYMENT_METHOD_LABELS, type RosterRow } from "@/features/billing/billing-roster";
import { formatCurrency } from "@/lib/format";

interface Props {
  rows: RosterRow[];
  selectedIds: Set<number>;
  onToggleSelect: (playerId: number) => void;
  onMarkPaid: (row: RosterRow) => void;
  onPartialPayment: (row: RosterRow) => void;
  onUndoPayment: (row: RosterRow) => void;
}

const SECTIONS = [
  {
    key: "unpaid",
    label: "Unpaid",
    helper: (count: number) =>
      count === 1 ? "1 player still waiting for a first payment" : `${count} players still waiting for a first payment`,
    toneClassName: "border-rose-200 bg-rose-50 text-rose-700",
  },
  {
    key: "partial",
    label: "Partial",
    helper: (count: number) =>
      count === 1 ? "1 player has a partial payment recorded" : `${count} players have partial payments recorded`,
    toneClassName: "border-amber-200 bg-amber-50 text-amber-700",
  },
  {
    key: "paid",
    label: "Paid / cleared",
    helper: (count: number) =>
      count === 1 ? "1 player is already settled or credited" : `${count} players are already settled or credited`,
    toneClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
] as const;

function balanceText(row: RosterRow) {
  const toneClassName =
    row.outstandingBalance > 0
      ? "text-sky-700"
      : row.outstandingBalance < 0
        ? "text-amber-700"
        : row.paymentTotal > 0
          ? "text-emerald-700"
          : "text-slate-700";
  const label =
    row.outstandingBalance < 0
      ? "Credit"
      : row.paymentTotal > 0
        ? "Cleared"
        : row.billedTotal === 0
          ? "No charges yet"
          : "Awaiting payment";
  const badgeClassName =
    row.outstandingBalance < 0
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : row.paymentTotal > 0
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-slate-50 text-slate-500";
  const summary =
    row.paymentTotal > 0
      ? `Charged ${formatCurrency(row.billedTotal)} • Paid ${formatCurrency(row.paymentTotal)}`
      : row.billedTotal === 0
        ? "No charges yet"
        : `Charged ${formatCurrency(row.billedTotal)} • No payment recorded`;
  return { toneClassName, label, badgeClassName, summary };
}

const undoButtonClass =
  "inline-flex min-h-9 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-amber-700 transition hover:border-amber-300 hover:bg-amber-100 cursor-pointer";

// The per-player billing table, grouped Unpaid / Partial / Paid (ported from the old Billing tab).
export function BillingRosterTable({ rows, selectedIds, onToggleSelect, onMarkPaid, onPartialPayment, onUndoPayment }: Props) {
  const sections = SECTIONS.map((section) => ({
    ...section,
    rows: rows.filter((row) => getRosterGroup(row) === section.key),
  })).filter((section) => section.rows.length > 0);

  return (
    <table className="min-w-6xl w-max border-separate border-spacing-0 text-sm">
      <colgroup>
        <col className="w-12" />
        <col className="w-104" />
        <col className="w-72" />
        <col className="w-96" />
      </colgroup>
      <thead className="sticky top-0 z-10 shadow-[inset_0_-1px_0_0_rgba(186,230,253,1)]">
        <tr className="text-left text-[11px] uppercase tracking-[0.16em] text-slate-500">
          <th className="bg-white/95 px-4 py-2.5 font-semibold">Pick</th>
          <th className="bg-white/95 px-5 py-2.5 font-semibold">
            <div className="w-full max-w-80">Player</div>
          </th>
          <th className="bg-white/95 px-4 py-2.5 font-semibold">
            <div className="w-full max-w-60 text-center">Stats</div>
          </th>
          <th className="bg-white/95 px-4 py-2.5 font-semibold">
            <div className="mx-auto w-full max-w-64 text-center">Balance due</div>
          </th>
        </tr>
      </thead>
      {rows.length === 0 ? (
        <tbody>
          <tr>
            <td colSpan={4} className="px-6 py-12 text-center text-sm text-slate-500">
              No billing records match the current search.
            </td>
          </tr>
        </tbody>
      ) : (
        sections.map((section) => (
          <tbody key={section.key} aria-label={section.label}>
            <tr>
              <td colSpan={4} className="bg-slate-50/70 px-4 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${section.toneClassName}`}>
                    {section.label}
                  </span>
                  <span className="text-xs text-slate-500">{section.helper(section.rows.length)}</span>
                </div>
              </td>
            </tr>
            {section.rows.map((row) => {
              const balance = balanceText(row);
              const paymentInfo = [
                row.latestPaymentMethod ? PAYMENT_METHOD_LABELS[row.latestPaymentMethod] : null,
                row.latestPaymentReference ? `Ref: ${row.latestPaymentReference}` : null,
              ].filter((part): part is string => part !== null);
              const canUndo = row.latestReversiblePaymentAmount > 0;

              return (
                <tr key={row.player.id} className="border-t border-slate-100/80 transition hover:bg-slate-50/70">
                  <td className="px-4 py-3 align-middle">
                    {row.outstandingBalance > 0 ? (
                      <label className="inline-flex cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.player.id)}
                          onChange={() => onToggleSelect(row.player.id)}
                          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          aria-label={`Select ${row.player.name} for bulk payment`}
                        />
                      </label>
                    ) : (
                      <span className="text-xs text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-5 py-3 align-middle">
                    <div className="w-full max-w-80 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-lg font-semibold leading-5 text-slate-900">{row.player.name}</div>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${row.status.className}`}>
                          {row.status.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                        <span>{row.skillLabel}</span>
                        <span className="text-slate-300">•</span>
                        <span>Court fee {formatCurrency(row.courtFeeTotal)}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="grid w-full max-w-60 grid-cols-3 divide-x divide-slate-200/80 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/70">
                      <div className="px-2 py-2.5 text-center">
                        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Games</div>
                        <div className="mt-1 text-sm font-semibold tabular-nums text-slate-700">{row.player.games_played}</div>
                      </div>
                      <div className="px-2 py-2.5 text-center">
                        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Shuttle</div>
                        <div className="mt-1 text-sm font-medium tabular-nums text-slate-600">{formatCurrency(row.shuttleTotal)}</div>
                      </div>
                      <div className="px-2 py-2.5 text-center">
                        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Extras</div>
                        <div className={`mt-1 text-sm font-medium tabular-nums ${row.extras >= 0 ? "text-slate-600" : "text-rose-600"}`}>
                          {formatCurrency(row.extras)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="mx-auto flex w-full max-w-64 flex-col items-start gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className={`text-lg font-semibold tracking-tight tabular-nums ${balance.toneClassName}`}>
                          {formatCurrency(row.outstandingBalance)}
                        </div>
                        {row.outstandingBalance <= 0 && (
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${balance.badgeClassName}`}
                          >
                            {balance.label}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] leading-4 text-slate-500">{balance.summary}</div>
                      {paymentInfo.length > 0 && <div className="text-[11px] text-slate-500">{paymentInfo.join(" • ")}</div>}
                      {row.outstandingBalance > 0 ? (
                        <div className="grid w-full grid-cols-2 gap-1.5 pt-0.5 text-xs font-medium">
                          <button
                            type="button"
                            onClick={() => onMarkPaid(row)}
                            aria-label={`Mark ${row.player.name} paid`}
                            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 cursor-pointer"
                          >
                            Mark paid
                          </button>
                          <button
                            type="button"
                            onClick={() => onPartialPayment(row)}
                            aria-label={`Partial payment for ${row.player.name}`}
                            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white px-2.5 py-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
                          >
                            Partial payment
                          </button>
                          {canUndo && (
                            <button
                              type="button"
                              onClick={() => onUndoPayment(row)}
                              aria-label={`Undo ${row.player.name}'s last payment`}
                              className={`col-span-2 ${undoButtonClass}`}
                            >
                              Undo
                            </button>
                          )}
                        </div>
                      ) : row.paymentTotal > 0 ? (
                        <div className="flex w-full flex-wrap items-center gap-1.5 pt-0.5 text-xs font-medium">
                          <span className="inline-flex rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-emerald-700">
                            Paid
                          </span>
                          {canUndo && (
                            <button
                              type="button"
                              onClick={() => onUndoPayment(row)}
                              aria-label={`Undo ${row.player.name}'s last payment`}
                              className={undoButtonClass}
                            >
                              Undo
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))
      )}
    </table>
  );
}
