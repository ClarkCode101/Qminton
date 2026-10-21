import { useState } from "react";

import { Navbar } from "@/app/navbar";
import { LoadError } from "@/components/load-error";
import { QmintonLogo } from "@/components/qminton-logo";
import { CreateQueueDialog, DeleteQueueDialog } from "@/features/queues/queue-dialogs";
import { QueueDeckCard } from "@/features/queues/queue-deck-card";
import { filterQueuesByName, QUEUE_SORT_OPTIONS, sortQueues, type QueueSortMode } from "@/features/queues/queue-list";
import { EditQueueDialog } from "@/features/queues/rename-queue-dialog";
import { useQueueSummaries } from "@/features/queues/use-queues";
import { formatCurrency } from "@/lib/format";
import type { QueueSummary } from "@/services/queues";

// Small "label | value" pill, same style as the Courts header chips
// (label bumped from 10px to 11px so it's easier to read).
function StatChip({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warning" }) {
  return (
    <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-sky-100 bg-sky-50/70 px-3 py-1 text-sm text-slate-700">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">{label}</span>
      <span className="h-3.5 w-px bg-sky-100" aria-hidden="true" />
      <span className={`font-semibold ${tone === "warning" ? "text-amber-700" : "text-slate-900"}`}>{value}</span>
    </span>
  );
}

const pageBackgroundClass = "bg-[radial-gradient(circle_at_top_left,#eff6ff,#f8fbff_36%,#eef6ff)]";

// Search and sort only help once there are more queues than fit at a glance.
const SHOW_SEARCH_FROM = 6;

// All of the organizer's queues as a compact card grid (redesigned on 2026-10-19:
// less text, tighter layout, same panel style as the Courts screen, plus the navbar).
export function LandingPage() {
  const { data: queues, isPending, isError, refetch } = useQueueSummaries();
  const [showNewQueue, setShowNewQueue] = useState(false);
  const [queuePendingDeletion, setQueuePendingDeletion] = useState<{ id: string; name: string } | null>(null);
  const [queueToEdit, setQueueToEdit] = useState<QueueSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<QueueSortMode>("latest");

  if (isPending) {
    return (
      <div className={`flex min-h-screen items-center justify-center ${pageBackgroundClass}`}>
        <p className="text-sm text-slate-500">Loading queues...</p>
      </div>
    );
  }

  if (isError) {
    return <LoadError message="Could not load your queues. Check your connection and try again." onRetry={() => void refetch()} />;
  }

  const showSearchTools = queues.length >= SHOW_SEARCH_FROM;
  // With the tools hidden, ignore any leftover search and use the default order.
  const visibleQueues = showSearchTools
    ? filterQueuesByName(sortQueues(queues, sortMode), searchQuery)
    : sortQueues(queues, "latest");
  const totalCollected = queues.reduce((total, queue) => total + queue.totalCollected, 0);
  const totalUnpaid = queues.reduce((total, queue) => total + (queue.totalBilled - queue.totalCollected), 0);

  return (
    // Full-height panel like the Courts screen: the white panel reaches down to the
    // navbar, and only the card list scrolls when there are many queues.
    <div className={`flex h-screen flex-col overflow-hidden ${pageBackgroundClass}`}>
      {showNewQueue && <CreateQueueDialog onClose={() => setShowNewQueue(false)} />}

      {queuePendingDeletion && (
        <DeleteQueueDialog queue={queuePendingDeletion} onClose={() => setQueuePendingDeletion(null)} />
      )}

      {queueToEdit && <EditQueueDialog queue={queueToEdit} onClose={() => setQueueToEdit(null)} />}

      <Navbar queueId={null} />

      <main className="app-shell-safe-bottom mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col p-4 sm:p-5 lg:p-6">
        <section className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-sky-200 bg-white/95 shadow-sm backdrop-blur-sm">
          <header className="shrink-0 border-b border-sky-100 px-4 py-3 sm:px-5 sm:py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <QmintonLogo size={28} />
                <h1 className="mt-3 text-xl font-black tracking-tight text-slate-900 sm:text-[1.55rem]">Your Queues</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatChip label="Queues" value={`${queues.length}`} />
                  <StatChip label="Collected" value={formatCurrency(totalCollected)} />
                  <StatChip label="Unpaid" value={formatCurrency(totalUnpaid)} tone={totalUnpaid > 0 ? "warning" : "default"} />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowNewQueue(true)}
                className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-blue-600 px-4.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 cursor-pointer sm:w-auto md:min-w-40"
              >
                + New Queue
              </button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
            {showSearchTools && (
              <div className="mb-4 flex shrink-0 flex-col gap-2 rounded-2xl border border-sky-100 bg-slate-50/80 px-3 py-2 sm:flex-row sm:items-center">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-sky-100 bg-white px-3 py-1.5 focus-within:border-sky-200">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
                  </svg>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search queues"
                    className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-500"
                    aria-label="Search queues"
                  />
                </label>

                <div className="inline-flex h-9 shrink-0 items-center gap-1 self-start rounded-full bg-slate-100 p-1 sm:self-auto">
                  {QUEUE_SORT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSortMode(option.id)}
                      className={`inline-flex h-full items-center justify-center rounded-full px-3 text-xs font-semibold transition-colors cursor-pointer ${
                        sortMode === option.id ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
                      }`}
                      aria-pressed={sortMode === option.id}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {queues.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/50 px-6 py-10 text-center">
                <p className="text-lg font-semibold text-slate-700">No queues yet</p>
                <button
                  type="button"
                  onClick={() => setShowNewQueue(true)}
                  className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 cursor-pointer"
                >
                  + Create your first queue
                </button>
              </div>
            ) : visibleQueues.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/50 px-6 py-10 text-center">
                <p className="text-lg font-semibold text-slate-700">No matching queues</p>
                <p className="mt-1 text-sm text-slate-500">Try a different search.</p>
              </div>
            ) : (
              <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleQueues.map((queue) => (
                    <QueueDeckCard
                      key={queue.id}
                      queue={queue}
                      onEdit={() => setQueueToEdit(queue)}
                      onDelete={() => setQueuePendingDeletion({ id: queue.id, name: queue.name })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
