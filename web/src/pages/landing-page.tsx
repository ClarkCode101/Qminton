import { useState } from "react";
import { useNavigate } from "react-router";

import { LoadError } from "@/components/load-error";
import { CreateQueueDialog, DeleteQueueDialog } from "@/features/queues/queue-dialogs";
import { QueueDeckCard } from "@/features/queues/queue-deck-card";
import {
  filterQueuesByName,
  getBusiestQueue,
  getLatestQueue,
  QUEUE_SORT_OPTIONS,
  sortQueues,
  type QueueSortMode,
} from "@/features/queues/queue-list";
import { useQueueSummaries } from "@/features/queues/use-queues";
import { formatCurrency, formatTime } from "@/lib/format";
import { getQueuePath } from "@/lib/routes";

function StatCard({ label, value, tone = "sky" }: { label: string; value: string; tone?: "sky" | "amber" | "emerald" }) {
  const toneClassName = {
    sky: "border-sky-200/80 bg-sky-50/70 text-sky-700",
    amber: "border-amber-200/80 bg-amber-50/80 text-amber-700",
    emerald: "border-emerald-200/80 bg-emerald-50/80 text-emerald-700",
  }[tone];

  return (
    <div className={`rounded-3xl border px-4 py-4 shadow-sm ${toneClassName}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-80">{label}</p>
      <p className="mt-3 truncate text-2xl font-black tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

// The "launcher deck": all of the organizer's queues (ported from the old /landing).
export function LandingPage() {
  const navigate = useNavigate();
  const { data: queues, isPending, isError, refetch } = useQueueSummaries();
  const [showNewQueue, setShowNewQueue] = useState(false);
  const [queuePendingDeletion, setQueuePendingDeletion] = useState<{ id: string; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<QueueSortMode>("latest");

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#dbeafe_0%,#eef6ff_38%,#f8fbff_100%)]">
        <p className="text-sm text-slate-400">Loading landing page...</p>
      </div>
    );
  }

  if (isError) {
    return <LoadError message="Could not load your queues. Check your connection and try again." onRetry={() => void refetch()} />;
  }

  const latestQueue = getLatestQueue(queues);
  const busiestQueue = getBusiestQueue(queues);
  const visibleQueues = filterQueuesByName(sortQueues(queues, sortMode), searchQuery);
  const totalCollected = queues.reduce((total, queue) => total + queue.totalCollected, 0);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#dbeafe_0%,#eef6ff_38%,#f8fbff_100%)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-8 h-56 w-56 rounded-full bg-sky-200/35 blur-3xl" />
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-cyan-100/60 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-amber-100/40 blur-3xl" />
      </div>

      {showNewQueue && <CreateQueueDialog onClose={() => setShowNewQueue(false)} />}

      {queuePendingDeletion && (
        <DeleteQueueDialog queue={queuePendingDeletion} onClose={() => setQueuePendingDeletion(null)} />
      )}

      <main className="relative mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-5">
        <div className="grid min-h-[calc(100vh-2rem)] gap-4 lg:grid-rows-[auto_minmax(0,1fr)] sm:min-h-[calc(100vh-2.5rem)]">
          <section className="rounded-4xl border border-sky-200/80 bg-white/88 p-5 shadow-[0_24px_60px_rgba(186,230,253,0.16)] backdrop-blur-sm sm:p-6">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,360px)] xl:items-stretch">
              <div className="overflow-hidden rounded-[28px] border border-sky-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(239,246,255,0.88))] p-5 shadow-sm sm:p-6">
                <p className="text-sm font-bold tracking-tight text-slate-900">
                  <span className="text-sky-600">Q</span>minton
                </p>
                <div className="mt-3 inline-flex items-center rounded-full border border-sky-200 bg-sky-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
                  Launcher Deck
                </div>
                <h1 className="mt-4 max-w-2xl text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                  Pick the board. Reopen the rhythm.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  This screen is your overview hub: browse today&apos;s boards, reopen recent sessions, and launch a new queue without entering the live workspace first.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <StatCard label="Latest Queue" value={latestQueue?.name ?? "None yet"} tone="sky" />
                  <StatCard label="Most Players" value={(busiestQueue?.playerCount ?? 0).toLocaleString("en-PH")} tone="amber" />
                  <StatCard label="Boards On Deck" value={`${queues.length}`} tone="emerald" />
                </div>

                <div className="mt-6 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowNewQueue(true)}
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 cursor-pointer"
                  >
                    + Launch New Queue
                  </button>
                  {latestQueue && (
                    <button
                      type="button"
                      onClick={() => navigate(getQueuePath(latestQueue.id))}
                      className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-sky-200 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:bg-sky-50 cursor-pointer"
                    >
                      Continue {latestQueue.name}
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-[28px] border border-sky-100 bg-[linear-gradient(160deg,rgba(14,116,144,0.96),rgba(14,165,233,0.85))] p-5 text-white shadow-[0_18px_36px_rgba(14,116,144,0.24)] sm:p-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-100/90">Session Overview</p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-100/80">Latest Update</p>
                    <p className="mt-2 text-lg font-black tracking-tight">
                      {latestQueue ? formatTime(latestQueue.updatedAt) : "No recent activity"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-100/80">Collections Snapshot</p>
                    {/* Old bug #8: now the money actually collected, not the total billed. */}
                    <p className="mt-2 text-lg font-black tracking-tight">{formatCurrency(totalCollected)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-100/80">How To Use</p>
                    <p className="mt-2 text-sm leading-6 text-sky-50/90">
                      Search, sort, and jump straight into the board you need. The live workspace stays focused on court operations; this page stays focused on selection.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="min-h-0 overflow-hidden rounded-4xl border border-sky-200/80 bg-white/90 p-4 shadow-[0_18px_40px_rgba(186,230,253,0.14)] backdrop-blur-sm sm:p-5">
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 flex-col gap-4 border-b border-sky-100 pb-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">Queue Atlas</p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Open a board from the deck.</h2>
                </div>

                {queues.length > 0 && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
                    <label className="flex min-w-0 items-center gap-2 rounded-full border border-sky-100 bg-slate-50 px-3 py-2 focus-within:border-sky-200 focus-within:bg-white sm:min-w-72">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
                      </svg>
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search queue names"
                        className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                        aria-label="Search landing page queues"
                      />
                    </label>

                    <div className="inline-flex h-10 shrink-0 items-center gap-1 self-start rounded-full bg-slate-100 p-1">
                      {QUEUE_SORT_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setSortMode(option.id)}
                          className={`inline-flex h-full items-center justify-center rounded-full px-3 text-xs font-semibold transition-colors cursor-pointer ${
                            sortMode === option.id ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
                          }`}
                          aria-pressed={sortMode === option.id}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {queues.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center py-6">
                  <div className="w-full max-w-lg rounded-[28px] border border-dashed border-sky-200 bg-[linear-gradient(180deg,rgba(240,249,255,0.72),rgba(255,255,255,0.92))] px-6 py-10 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">Queue Atlas</p>
                    <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">No boards on deck yet.</p>
                    <p className="mt-3 text-sm leading-6 text-slate-500">
                      Launch your first queue and it will appear here as a reusable board for the rest of the session.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowNewQueue(true)}
                      className="mt-6 inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-950 px-6 text-sm font-semibold text-white transition-colors hover:bg-slate-800 cursor-pointer"
                    >
                      + Create your first queue
                    </button>
                  </div>
                </div>
              ) : visibleQueues.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center py-6">
                  <div className="w-full max-w-md rounded-[28px] border border-dashed border-sky-200 bg-sky-50/60 px-6 py-10 text-center">
                    <p className="text-lg font-semibold text-slate-700">No matching queues</p>
                    <p className="mt-2 text-sm text-slate-500">Try a different search term or return to latest sorting.</p>
                  </div>
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto pt-4 pr-1">
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {visibleQueues.map((queue) => (
                      <QueueDeckCard
                        key={queue.id}
                        queue={queue}
                        onOpen={() => navigate(getQueuePath(queue.id))}
                        onDelete={() => setQueuePendingDeletion({ id: queue.id, name: queue.name })}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
