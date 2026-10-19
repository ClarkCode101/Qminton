import { formatCurrency, formatDateTime, gameModeLabel, pluralizePlayer } from "@/lib/format";
import type { QueueSummary } from "@/services/queues";

interface Props {
  queue: QueueSummary;
  onOpen: () => void;
  onDelete: () => void;
}

// One queue card on the landing page (ported from the old QueueDeckCard).
export function QueueDeckCard({ queue, onOpen, onDelete }: Props) {
  return (
    <div className="group relative overflow-hidden rounded-[28px] border border-sky-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_18px_36px_rgba(14,116,144,0.08)]">
      <div className="absolute inset-x-4 top-0 h-1 rounded-full bg-[linear-gradient(90deg,#0ea5e9,#38bdf8,#7dd3fc)] opacity-80" />

      <div className="flex h-full flex-col gap-4 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-600">
              {gameModeLabel(queue.gameMode)} Board
            </p>
            <h3 className="mt-2 truncate text-xl font-black tracking-tight text-slate-900">{queue.name}</h3>
          </div>
          <span className="inline-flex min-h-8 shrink-0 items-center rounded-full border border-sky-100 bg-sky-50/70 px-3 text-xs font-semibold text-sky-700">
            {pluralizePlayer(queue.playerCount)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Collected</p>
            {/* Old bug #8: this used to show the total billed, not what was actually paid. */}
            <p className="mt-2 text-lg font-black tracking-tight text-slate-900">{formatCurrency(queue.totalCollected)}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Last Update</p>
            <p className="mt-2 text-sm font-semibold text-slate-700">{formatDateTime(queue.updatedAt)}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-sky-100 bg-[linear-gradient(180deg,rgba(240,249,255,0.8),rgba(255,255,255,0.9))] px-3 py-3 text-sm text-slate-600">
          Queue ready for match flow, court rotation, and collections.
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 cursor-pointer"
          >
            Open Board
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${queue.name}`}
            className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-500 transition-colors hover:bg-rose-50 cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
