import { Link } from "react-router";

import { MoreMenu } from "@/components/more-menu";
import { sortQueues } from "@/features/queues/queue-list";
import { useQueueSummaries } from "@/features/queues/use-queues";
import { formatDateTime, formatRelativeDate } from "@/lib/format";
import type { QueueSummary } from "@/services/queues";

interface Props {
  // The queue being viewed (pinned to the top, marked with a check); null on the empty home workspace.
  currentQueueId: string | null;
  onOpenQueue: (queueId: string) => void;
  onNewQueue: () => void;
  onDeleteQueue: (queue: Pick<QueueSummary, "id" | "name">) => void;
}

// The "Queues" popup above the navbar. Redesigned 2026-10-21 (owner): no
// search or sort (latest first, the open queue on top; the landing page keeps
// both for long lists), Delete moved into a "⋯" menu like the landing cards
// (the old ✕ looked like "close"), and a link to all queues.
export function QueueSwitcherPanel({ currentQueueId, onOpenQueue, onNewQueue, onDeleteQueue }: Props) {
  const { data: queues = [], isPending, isError, refetch } = useQueueSummaries();

  const sorted = sortQueues(queues, "latest");
  const visibleQueues = [
    ...sorted.filter((queue) => queue.id === currentQueueId),
    ...sorted.filter((queue) => queue.id !== currentQueueId),
  ];

  return (
    <div className="queue-list-panel absolute bottom-[calc(100%+0.75rem)] left-0 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-sky-200 bg-white shadow-[0_20px_40px_rgba(14,116,144,0.16)]">
      <div className="flex items-center justify-between gap-2 border-b border-sky-100 px-4 py-3">
        <h2 className="text-base font-bold text-slate-900">Queues</h2>
        <button
          type="button"
          onClick={onNewQueue}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-blue-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-700 cursor-pointer"
        >
          + New Queue
        </button>
      </div>

      {/* Scrolls past ~4–5 queues. On short screens (phone sideways) it shrinks so
          the header and "+ New Queue" stay on screen. */}
      <div className="max-h-[max(4.5rem,min(18rem,calc(100dvh-14rem)))] overflow-y-auto p-2">
        {isPending ? (
          <div className="px-3 py-6 text-sm text-slate-500">Loading queues...</div>
        ) : isError ? (
          <div className="px-3 py-6 text-sm text-slate-500">
            Could not load queues.{" "}
            <button type="button" onClick={() => void refetch()} className="font-semibold text-blue-600 hover:underline cursor-pointer">
              Try again
            </button>
          </div>
        ) : queues.length === 0 ? (
          <div className="px-3 py-6 text-sm text-slate-500">No queues yet.</div>
        ) : (
          <ul className="space-y-1">
            {visibleQueues.map((queue) => {
              const isCurrentQueue = queue.id === currentQueueId;

              return (
                <li
                  key={queue.id}
                  className={`relative flex items-center gap-1 rounded-2xl pr-1.5 transition-colors ${
                    isCurrentQueue ? "bg-sky-50" : "hover:bg-slate-50"
                  }`}
                >
                  {isCurrentQueue && <span aria-hidden="true" className="absolute inset-y-2.5 left-0 w-1 rounded-full bg-blue-600" />}
                  <button
                    type="button"
                    onClick={() => onOpenQueue(queue.id)}
                    aria-current={isCurrentQueue ? "true" : undefined}
                    className="flex min-h-14 min-w-0 flex-1 items-center gap-2 rounded-2xl py-2 pl-3.5 pr-1 text-left cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm font-semibold ${isCurrentQueue ? "text-blue-800" : "text-slate-800"}`}>
                        {queue.name}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {queue.gameMode === "doubles" ? "Doubles" : "Singles"} · {queue.playerCount} players
                        {queue.updatedAt && (
                          <>
                            {" · "}
                            <time dateTime={queue.updatedAt} title={formatDateTime(queue.updatedAt)}>
                              {formatRelativeDate(queue.updatedAt)}
                            </time>
                          </>
                        )}
                      </div>
                    </div>
                    {isCurrentQueue && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  <MoreMenu
                    label={`More actions for ${queue.name}`}
                    placement="left"
                    items={[{ label: "Delete queue", tone: "danger", onSelect: () => onDeleteQueue({ id: queue.id, name: queue.name }) }]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-sky-100 px-4 py-2.5">
        <Link to="/landing" className="text-sm font-semibold text-blue-600 hover:underline">
          See all queues →
        </Link>
      </div>
    </div>
  );
}
