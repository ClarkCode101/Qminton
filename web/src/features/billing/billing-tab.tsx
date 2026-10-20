import { useDeferredValue, useEffect, useRef, useState } from "react";

import { BillingActivity } from "@/features/billing/billing-activity";
import { BillingModal } from "@/features/billing/billing-modal";
import {
  billingCsvFileName,
  buildBillingCsv,
  buildBillingSummaryText,
  buildRosterRows,
  countRosterFilters,
  getBillingTotals,
  getVisibleRosterRows,
  type RosterFilter,
  type RosterRow,
  type RosterSort,
} from "@/features/billing/billing-roster";
import { BillingRosterTable } from "@/features/billing/billing-roster-table";
import { BillingSetupForm } from "@/features/billing/billing-setup-form";
import { BillingTools } from "@/features/billing/billing-tools";
import { BulkPaymentDialog, MarkPaidDialog, PartialPaymentDialog, UndoPaymentDialog } from "@/features/billing/payment-dialogs";
import type { useBillingActions } from "@/features/billing/use-billing";
import type { BillingSetupOutput } from "@/features/queues/queue-form-schema";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import type { LedgerEntry } from "@/services/billing";
import type { Player } from "@/services/players";
import type { Queue } from "@/services/queues";

type Overlay = "setup" | "tools" | "activity";

interface Props {
  queue: Queue;
  // Every player of the queue, including removed ones (their debts stay visible).
  players: Player[];
  ledger: LedgerEntry[];
  actions: ReturnType<typeof useBillingActions>;
  onSaveBillingSetup: (data: BillingSetupOutput) => Promise<void>;
}

// Which payment dialog is open, and for whom.
type PaymentDialog =
  | { kind: "full" | "partial" | "undo"; row: RosterRow }
  | { kind: "bulk"; rows: RosterRow[] }
  | null;

const FILTERS: [RosterFilter, string][] = [
  ["all", "All"],
  ["unpaid", "Unpaid"],
  ["partial", "Partial"],
  ["paid", "Paid"],
];

// The Billing tab (ported from the old BillingView.tsx).
export function BillingTab({ queue, players, ledger, actions, onSaveBillingSetup }: Props) {
  const { showToast } = useToast();
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [sort, setSort] = useState<RosterSort>("highest-balance");
  const [selectedBulkIds, setSelectedBulkIds] = useState<number[]>([]);
  const [paymentDialog, setPaymentDialog] = useState<PaymentDialog>(null);
  const toolsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isToolsMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!toolsMenuRef.current?.contains(event.target as Node)) setIsToolsMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsToolsMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isToolsMenuOpen]);

  const rows = buildRosterRows(players, ledger);
  const activePlayers = players.filter((player) => !player.removed_at);
  const counts = countRosterFilters(rows);
  const totals = getBillingTotals(rows, ledger);
  const visibleRows = getVisibleRosterRows(rows, deferredSearch, filter, sort);

  // Bulk selection only keeps players who still owe something.
  const payableIds = new Set(rows.filter((row) => row.outstandingBalance > 0).map((row) => row.player.id));
  const effectiveBulkIds = selectedBulkIds.filter((id) => payableIds.has(id));
  const selectedBulkSet = new Set(effectiveBulkIds);
  const selectedBulkRows = rows.filter((row) => selectedBulkSet.has(row.player.id));
  const selectedBulkTotal = selectedBulkRows.reduce((total, row) => total + row.outstandingBalance, 0);
  const visibleBulkRows = visibleRows.filter((row) => row.outstandingBalance > 0);
  const allVisibleBulkSelected = visibleBulkRows.length > 0 && visibleBulkRows.every((row) => selectedBulkSet.has(row.player.id));

  const toggleBulk = (playerId: number) =>
    setSelectedBulkIds((ids) => (ids.includes(playerId) ? ids.filter((id) => id !== playerId) : [...ids, playerId]));

  const toggleVisibleBulk = () => {
    const visibleIds = visibleBulkRows.map((row) => row.player.id);
    setSelectedBulkIds((ids) =>
      allVisibleBulkSelected ? ids.filter((id) => !visibleIds.includes(id)) : [...new Set([...ids, ...visibleIds])],
    );
  };

  const summaryCards = [
    {
      label: "Open Balance",
      value: formatCurrency(totals.outstandingTotal),
      helper:
        totals.collectedTotal > 0
          ? `${formatCurrency(totals.collectedTotal)} settled so far`
          : `${activePlayers.length} players charged`,
      accentClassName: "bg-sky-50/80",
      valueClassName: totals.outstandingTotal > 0 ? "text-sky-700" : "text-emerald-700",
    },
    {
      label: "Collected",
      value: formatCurrency(totals.collectedTotal),
      helper:
        totals.collectedTotal <= 0
          ? "No payments recorded yet"
          : totals.partialCount > 0
            ? `${totals.fullyPaidCount} paid in full • ${totals.partialCount} partial`
            : `${totals.fullyPaidCount} paid in full`,
      accentClassName: "bg-white/90",
      valueClassName: "text-slate-900",
    },
    {
      label: "Players Due",
      value: `${totals.unpaidCount}`,
      helper:
        totals.unpaidCount === 0
          ? "All balances cleared"
          : totals.partialCount > 0
            ? `${totals.partialCount} partial • ${Math.max(totals.unpaidCount - totals.partialCount, 0)} not yet paid`
            : `${totals.unpaidCount} still open`,
      accentClassName: totals.unpaidCount === 0 ? "bg-emerald-50/70" : "bg-white/90",
      valueClassName: totals.unpaidCount === 0 ? "text-emerald-700" : "text-slate-900",
    },
  ];

  const toolsMenuActions: { overlay: Overlay; label: string; helper: string }[] = [
    {
      overlay: "activity",
      label: "Payment activity",
      helper: `${ledger.length} record${ledger.length === 1 ? "" : "s"} with export and share options`,
    },
    {
      overlay: "setup",
      label: "Billing setup",
      helper: `${formatCurrency(queue.court_fee)} court fee • ${formatCurrency(queue.game_rate)}/game`,
    },
    { overlay: "tools", label: "Advanced tools", helper: "Adjustments, split fees, refunds, and manual corrections" },
  ];

  const openOverlay = (next: Overlay) => {
    setIsToolsMenuOpen(false);
    setOverlay(next);
  };

  const shareSummary = async () => {
    const text = buildBillingSummaryText(rows, totals);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Billing summary", text });
        showToast("Billing summary shared", "success");
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showToast("Billing summary copied", "success");
        return;
      }
      showToast("Sharing is not available on this device", "error");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showToast("Failed to share billing summary", "error");
    }
  };

  const exportCsv = () => {
    try {
      const blob = new Blob([buildBillingCsv(rows)], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = billingCsvFileName();
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("Billing CSV exported", "success");
    } catch {
      showToast("Failed to export billing CSV", "error");
    }
  };

  // Runs a payment action; closes the dialog only when it saved.
  const runPayment = async (action: () => Promise<void>) => {
    try {
      await action();
      setPaymentDialog(null);
    } catch {
      // Toast already shown; keep the dialog open.
    }
  };

  const paymentBusy = actions.markPaid.isPending || actions.markPaidBulk.isPending || actions.undoPayment.isPending;

  return (
    <div className="flex-1 overflow-hidden">
      {paymentDialog?.kind === "full" && (
        <MarkPaidDialog
          playerName={paymentDialog.row.player.name}
          outstandingBalance={paymentDialog.row.outstandingBalance}
          busy={paymentBusy}
          onClose={() => setPaymentDialog(null)}
          onConfirm={(details) =>
            runPayment(() => actions.markPaid.mutateAsync({ playerId: paymentDialog.row.player.id, ...details }))
          }
        />
      )}

      {paymentDialog?.kind === "partial" && (
        <PartialPaymentDialog
          playerName={paymentDialog.row.player.name}
          outstandingBalance={paymentDialog.row.outstandingBalance}
          busy={paymentBusy}
          onClose={() => setPaymentDialog(null)}
          onConfirm={(details) =>
            runPayment(() =>
              actions.markPaid.mutateAsync({ playerId: paymentDialog.row.player.id, note: "Partial payment", ...details }),
            )
          }
        />
      )}

      {paymentDialog?.kind === "bulk" && (
        <BulkPaymentDialog
          playerNames={paymentDialog.rows.map((row) => row.player.name)}
          totalOutstanding={paymentDialog.rows.reduce((total, row) => total + row.outstandingBalance, 0)}
          busy={paymentBusy}
          onClose={() => setPaymentDialog(null)}
          onConfirm={(details) =>
            runPayment(async () => {
              const playerIds = paymentDialog.rows.map((row) => row.player.id);
              await actions.markPaidBulk.mutateAsync({ playerIds, ...details });
              setSelectedBulkIds((ids) => ids.filter((id) => !playerIds.includes(id)));
            })
          }
        />
      )}

      {paymentDialog?.kind === "undo" && (
        <UndoPaymentDialog
          playerName={paymentDialog.row.player.name}
          paymentAmount={paymentDialog.row.latestReversiblePaymentAmount}
          busy={paymentBusy}
          onClose={() => setPaymentDialog(null)}
          onConfirm={() => runPayment(() => actions.undoPayment.mutateAsync(paymentDialog.row.player.id))}
        />
      )}

      {overlay === "activity" && (
        <BillingActivity
          ledger={ledger}
          onShareSummary={() => void shareSummary()}
          onExportCsv={exportCsv}
          onClose={() => setOverlay(null)}
        />
      )}

      {overlay === "setup" && (
        <BillingModal
          title="Billing setup"
          description="Court fee and shuttle rate. Open this when pricing needs to change."
          badge={`${formatCurrency(queue.court_fee)} + ${formatCurrency(queue.game_rate)}/game`}
          onClose={() => setOverlay(null)}
          maxWidthClassName="max-w-xl"
        >
          <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Formula</p>
            <p className="mt-2 text-sm text-slate-600">
              Total billed = one-time court fee + (games played x shuttle rate) + manual adjustments.
            </p>
          </div>
          <BillingSetupForm courtFee={queue.court_fee} gameRate={queue.game_rate} onSave={onSaveBillingSetup} />
        </BillingModal>
      )}

      {overlay === "tools" && (
        <BillingTools
          adjustablePlayers={rows.map((row) => row.player)}
          activePlayers={activePlayers}
          busy={actions.adjust.isPending || actions.sharedFee.isPending}
          onAdjust={async (input) => {
            await actions.adjust.mutateAsync(input);
          }}
          onSharedFee={async (input) => {
            await actions.sharedFee.mutateAsync(input);
          }}
          onClose={() => setOverlay(null)}
        />
      )}

      <div className="h-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.35),transparent_42%),linear-gradient(180deg,#eff6ff_0%,#f8fafc_48%,#ffffff_100%)]">
        <div className="mx-auto flex h-full w-full max-w-7xl flex-col px-4 pt-3 pb-0 sm:px-6 sm:pt-4 sm:pb-0 lg:px-8">
          <section className="relative isolate flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-sky-100 bg-white/92 shadow-[0_16px_36px_rgba(15,23,42,0.06)] backdrop-blur">
            <div className="shrink-0 border-b border-sky-100 px-5 py-3.5">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-lg font-semibold tracking-tight text-slate-900 lg:text-xl">Billing workspace</h1>
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
                      <span className="uppercase tracking-[0.14em] text-slate-500">Total billed</span>
                      <span className="text-sm font-semibold text-blue-700">{formatCurrency(totals.billedTotal)}</span>
                    </span>
                  </div>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600 sm:text-sm">
                    Focus on open balances first, then open tools only when pricing or corrections need attention.
                  </p>
                </div>

                <div ref={toolsMenuRef} className="relative shrink-0 self-start">
                  <button
                    type="button"
                    onClick={() => setIsToolsMenuOpen((open) => !open)}
                    aria-haspopup="menu"
                    aria-expanded={isToolsMenuOpen}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3.5 py-2 text-sm font-medium text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 cursor-pointer"
                  >
                    <span>Tools</span>
                    <span className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                      {toolsMenuActions.length}
                    </span>
                    <svg
                      className={`h-4 w-4 transition-transform ${isToolsMenuOpen ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                    </svg>
                  </button>

                  {isToolsMenuOpen && (
                    <div
                      role="menu"
                      aria-label="Billing tools"
                      className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
                    >
                      <div className="border-b border-slate-100 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Billing tools</div>
                        <div className="mt-1 text-sm text-slate-600">
                          Open setup, activity history, or manual billing actions from one place.
                        </div>
                      </div>
                      <div className="p-2">
                        {toolsMenuActions.map((action) => (
                          <button
                            key={action.overlay}
                            type="button"
                            role="menuitem"
                            onClick={() => openOverlay(action.overlay)}
                            className="flex w-full items-start justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-slate-50 cursor-pointer"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-slate-800">{action.label}</div>
                              <div className="mt-0.5 text-xs leading-5 text-slate-500">{action.helper}</div>
                            </div>
                            <svg
                              className="mt-0.5 h-4 w-4 shrink-0 text-slate-300"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                              aria-hidden="true"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
                            </svg>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {summaryCards.map((card) => (
                  <div key={card.label} className={`min-w-0 rounded-3xl border border-sky-100/90 px-4 py-2.5 shadow-sm ${card.accentClassName}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{card.label}</p>
                    <p className={`mt-1.5 text-[1.75rem] font-black leading-none tracking-[-0.04em] ${card.valueClassName}`}>
                      {card.value}
                    </p>
                    <p className="mt-1.5 text-[11px] leading-4 text-slate-500">{card.helper}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="z-20 shrink-0 border-b border-sky-100 bg-white/95 px-5 py-2 backdrop-blur">
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <h2 className="text-base font-semibold text-slate-900">Per-player billing</h2>
                  <span className="text-sm text-slate-300">•</span>
                  <p className="text-sm text-slate-500">
                    Showing {visibleRows.length} of {counts[filter]} player{counts[filter] === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="grid gap-2 lg:grid-cols-[auto_minmax(0,1fr)_220px] lg:items-center">
                  <div className="w-full overflow-x-auto pb-0.5 lg:justify-self-start lg:pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <div className="inline-flex min-w-max items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50/80 p-1">
                      {FILTERS.map(([key, label]) => {
                        const isActive = filter === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setFilter(key)}
                            aria-pressed={isActive}
                            className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition cursor-pointer ${
                              isActive
                                ? "border-slate-200 bg-white text-slate-900 shadow-sm"
                                : "border-transparent bg-transparent text-slate-600 hover:border-slate-200/80 hover:bg-white/90 hover:text-slate-900"
                            }`}
                          >
                            <span>{label}</span>
                            <span
                              className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                                isActive ? "bg-slate-100 text-slate-700" : "bg-white text-slate-500"
                              }`}
                            >
                              {counts[key]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="relative min-w-0">
                    <input
                      type="text"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      aria-label="Search billing players"
                      className="w-full rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-2 pr-11 text-sm text-slate-800 outline-none transition placeholder:text-slate-500 focus:border-sky-400"
                      placeholder="Search players"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-sm font-semibold text-slate-500 transition hover:bg-white hover:text-slate-700 cursor-pointer"
                        aria-label="Clear player search"
                      >
                        X
                      </button>
                    )}
                  </div>

                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as RosterSort)}
                    aria-label="Sort players"
                    className="w-full rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-400"
                  >
                    <option value="highest-balance">Sort: Largest balance</option>
                    <option value="most-games">Sort: Most games</option>
                    <option value="largest-extra">Sort: Largest extras</option>
                    <option value="name">Sort: Name</option>
                  </select>
                </div>
              </div>
            </div>

            {visibleBulkRows.length > 0 && (
              <div className="shrink-0 border-b border-slate-100/90 bg-white/95 px-5 py-2 backdrop-blur">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-500 sm:text-sm">
                    <span className="inline-flex rounded-full border border-slate-200/80 bg-slate-50/80 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      Bulk payment
                    </span>
                    <span className="inline-flex rounded-full border border-sky-200/80 bg-sky-50/70 px-2.5 py-1 text-[11px] font-medium text-sky-700">
                      {visibleBulkRows.length} unpaid eligible
                    </span>
                    {effectiveBulkIds.length > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                        <span>{effectiveBulkIds.length} selected</span>
                        <span className="text-slate-300">•</span>
                        <span className="font-semibold text-emerald-700">{formatCurrency(selectedBulkTotal)}</span>
                      </span>
                    ) : (
                      <span>Select unpaid rows to record one payment in one step.</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={toggleVisibleBulk}
                      className="inline-flex rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white cursor-pointer"
                    >
                      {allVisibleBulkSelected ? "Clear visible" : "Select visible"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedBulkIds([])}
                      disabled={effectiveBulkIds.length === 0}
                      className="inline-flex rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                    >
                      Clear selection
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentDialog({ kind: "bulk", rows: selectedBulkRows })}
                      disabled={effectiveBulkIds.length === 0}
                      className="inline-flex rounded-xl border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:border-emerald-300 disabled:bg-emerald-300 cursor-pointer"
                    >
                      Mark selected paid
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="app-scroll-safe-bottom relative min-h-0 flex-1 overflow-auto overscroll-contain">
              <BillingRosterTable
                rows={visibleRows}
                selectedIds={selectedBulkSet}
                onToggleSelect={toggleBulk}
                onMarkPaid={(row) => setPaymentDialog({ kind: "full", row })}
                onPartialPayment={(row) => setPaymentDialog({ kind: "partial", row })}
                onUndoPayment={(row) => setPaymentDialog({ kind: "undo", row })}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
