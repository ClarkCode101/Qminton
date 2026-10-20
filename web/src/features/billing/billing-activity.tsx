import { useDeferredValue, useState } from "react";

import { BillingModal } from "@/features/billing/billing-modal";
import { entryTypeLabel, PAYMENT_METHOD_LABELS, searchLedger } from "@/features/billing/billing-roster";
import { formatCurrency } from "@/lib/format";
import type { LedgerEntry } from "@/services/billing";

interface Props {
  ledger: LedgerEntry[];
  onShareSummary: () => void;
  onExportCsv: () => void;
  onClose: () => void;
}

function amountClassName(entry: LedgerEntry): string {
  if (entry.amount < 0) return "text-rose-600";
  return entry.entry_type === "payment" ? "text-emerald-600" : "text-blue-700";
}

// "Payment activity": every ledger record, searchable (ported from the old overlay).
export function BillingActivity({ ledger, onShareSummary, onExportCsv, onClose }: Props) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const entries = searchLedger(ledger, deferredSearch);
  const hasQuery = deferredSearch.trim() !== "";

  return (
    <BillingModal
      title="Payment activity"
      description="All ledger entries from court fees, game fees, payments, refunds, and shared charges."
      badge={hasQuery ? `${entries.length} of ${ledger.length}` : `${ledger.length} records`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-500">
            Search across every stored ledger record, then copy or export the current billing summary.
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onShareSummary}
              className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 cursor-pointer"
            >
              Share summary
            </button>
            <button
              type="button"
              onClick={onExportCsv}
              className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 cursor-pointer"
            >
              Export CSV
            </button>
          </div>
        </div>
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search activity"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-sm text-slate-800 outline-none transition placeholder:text-slate-500 focus:border-sky-400"
            placeholder="Search by player, note, type, or match"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-sm font-semibold text-slate-500 transition hover:bg-white hover:text-slate-700 cursor-pointer"
              aria-label="Clear activity search"
            >
              X
            </button>
          )}
        </div>
        <div className="overflow-x-auto lg:max-h-128 lg:overflow-auto">
          <table className="min-w-210 w-full text-sm">
            <thead className="sticky top-0 z-10 bg-white shadow-[inset_0_-1px_0_0_rgba(186,230,253,1)]">
              <tr className="text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                <th className="px-6 py-4 font-semibold">Time</th>
                <th className="px-4 py-4 font-semibold">Player</th>
                <th className="px-4 py-4 font-semibold">Type</th>
                <th className="px-4 py-4 font-semibold">Note</th>
                <th className="px-4 py-4 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                    {ledger.length === 0 ? "No payment activity yet." : "No activity records match this search."}
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const paymentInfo = [
                    entry.payment_method ? PAYMENT_METHOD_LABELS[entry.payment_method] : null,
                    entry.payment_reference ? `Ref: ${entry.payment_reference}` : null,
                  ].filter((part): part is string => part !== null);

                  return (
                    <tr key={entry.id} className="border-t border-slate-100 transition hover:bg-sky-50/50">
                      <td className="px-6 py-4 text-slate-500">
                        {new Date(entry.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
                      </td>
                      <td className="px-4 py-4 font-medium text-slate-800">{entry.player_name}</td>
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                          {entryTypeLabel(entry)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        <div>{entry.note}</div>
                        {paymentInfo.length > 0 && <div className="mt-1 text-xs text-slate-500">{paymentInfo.join(" • ")}</div>}
                        {entry.match_no !== null && <div className="mt-1 text-xs text-slate-500">Match #{entry.match_no}</div>}
                      </td>
                      <td className={`px-4 py-4 font-semibold ${amountClassName(entry)}`}>{formatCurrency(entry.amount)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </BillingModal>
  );
}
