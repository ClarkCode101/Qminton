import { useState } from "react";

import { filterQueuesByName, QUEUE_SORT_OPTIONS, sortQueues, type QueueSortMode } from "@/features/queues/queue-list";
import { useQueueSummaries } from "@/features/queues/use-queues";
import type { QueueSummary } from "@/services/queues";

interface Props {
  // The queue being viewed (pinned to the top, marked "Current"); null on the empty home workspace.
  currentQueueId: string | null;
  onOpenQueue: (queueId: string) => void;
  onNewQueue: () => void;
  onDeleteQueue: (queue: Pick<QueueSummary, "id" | "name">) => void;
}

// The "Queue List" popup above the navbar (ported from the old Navbar).
export function QueueSwitcherPanel({ currentQueueId, onOpenQueue, onNewQueue, onDeleteQueue }: Props) {
  const { data: queues = [], isPending, isError, refetch } = useQueueSummaries();
  const [sortMode, setSortMode] = useState<QueueSortMode>("latest");
  const [searchQuery, setSearchQuery] = useState("");

  const sorted = sortQueues(queues, sortMode);
  const currentFirst = [
    ...sorted.filter((queue) => queue.id === currentQueueId),
    ...sorted.filter((queue) => queue.id !== currentQueueId),
  ];
  const visibleQueues = filterQueuesByName(currentFirst, searchQuery);

  return (
    <div className="queue-list-panel absolute bottom-[calc(100%+0.75rem)] left-0 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-sky-200 bg-white shadow-[0_20px_40px_rgba(14,116,144,0.16)]">
      <div className="border-b border-sky-100 px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">Queue List</p>
            <p className="mt-0.5 text-[13px] leading-5 text-slate-500">Switch to another queue.</p>
          </div>

          <button
            type="button"
            onClick={onNewQueue}
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-blue-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-700 cursor-pointer"
          >
            + New Queue
          </button>
        </div>

        <div className="mt-2.5 flex items-center gap-1.5">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-sky-100 bg-slate-50 px-3 py-1.5 focus-within:border-sky-200 focus-within:bg-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search"
              className="min-w-0 flex-1 bg-transparent text-sm leading-5 text-slate-700 outline-none placeholder:text-slate-400"
              aria-label="Search queues"
            />
          </label>

          <div className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-slate-100 p-0.5">
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
      </div>

      <div className="max-h-52 overflow-y-auto p-2">
        {isPending ? (
          <div className="px-3 py-6 text-sm text-slate-400">Loading queues...</div>
        ) : isError ? (
          <div className="px-3 py-6 text-sm text-slate-500">
            Could not load queues.{" "}
            <button type="button" onClick={() => void refetch()} className="font-semibold text-blue-600 hover:underline cursor-pointer">
              Try again
            </button>
          </div>
        ) : queues.length === 0 ? (
          <div className="px-3 py-6 text-sm text-slate-400">No queues available.</div>
        ) : visibleQueues.length === 0 ? (
          <div className="px-3 py-6 text-sm text-slate-400">No matching queues.</div>
        ) : (
          <div className="space-y-1">
            {visibleQueues.map((queue) => {
              const isCurrentQueue = queue.id === currentQueueId;

              return (
                <div
                  key={queue.id}
                  className={`group flex items-center gap-2 rounded-2xl px-2 py-2 transition-colors ${
                    isCurrentQueue ? "bg-sky-50 text-slate-900" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onOpenQueue(queue.id)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl px-1 py-1 text-left cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{queue.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {queue.gameMode === "doubles" ? "Doubles" : "Singles"} • {queue.playerCount} players
                      </div>
                    </div>
                    {isCurrentQueue && (
                      <span className="shrink-0 rounded-full border border-sky-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                        Current
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteQueue({ id: queue.id, name: queue.name });
                    }}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-100 bg-white/90 text-slate-300 shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 focus-visible:border-rose-200 focus-visible:bg-rose-50 focus-visible:text-rose-500 group-hover:text-slate-400 cursor-pointer"
                    aria-label={`Delete ${queue.name}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
