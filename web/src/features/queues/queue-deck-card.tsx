import { formatCurrency, formatDateTime, gameModeLabel, pluralizePlayer } from "@/lib/format";
import type { QueueSummary } from "@/services/queues";

interface Props {
  queue: QueueSummary;
  onOpen: () => void;
  onDelete: () => void;
}

// One compact queue card on the landing page.
export function QueueDeckCard({ queue, onOpen, onDelete }: Props) {
  return (
    <article className="flex flex-col rounded-2xl border border-sky-100 bg-white p-4 shadow-sm transition-colors hover:border-sky-200">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">
          {gameModeLabel(queue.gameMode)}
        </span>
        <span className="truncate text-xs text-slate-400">{formatDateTime(queue.updatedAt)}</span>
      </div>

      <h3 className="mt-3 truncate text-lg font-black tracking-tight text-slate-900">{queue.name}</h3>

      <dl className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
        <div>
          <dt className="sr-only">Players</dt>
          <dd>{pluralizePlayer(queue.playerCount)}</dd>
        </div>
        <div className="flex items-center gap-1">
          <dt className="sr-only">Collected</dt>
          {/* Money actually received (old bug #8 showed the total billed here). */}
          <dd className="font-semibold text-slate-700">{formatCurrency(queue.totalCollected)}</dd>
          <span aria-hidden="true">collected</span>
        </div>
      </dl>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 cursor-pointer"
        >
          Open
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${queue.name}`}
          title="Delete queue"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </button>
      </div>
    </article>
  );
}
