import { Link } from "react-router";

import { QueueCardMenu } from "@/features/queues/queue-card-menu";
import { formatCurrency, formatDateTime, formatRelativeDate, gameModeLabel, pluralizePlayer } from "@/lib/format";
import { getQueuePath } from "@/lib/routes";
import type { QueueSummary } from "@/services/queues";

interface Props {
  queue: QueueSummary;
  onDelete: () => void;
}

// What the organizer most wants to know about money in one short line.
function PaymentStatus({ totalBilled, totalCollected }: { totalBilled: number; totalCollected: number }) {
  const unpaid = totalBilled - totalCollected;
  if (unpaid > 0) {
    return <span className="text-sm font-semibold text-amber-700">{formatCurrency(unpaid)} unpaid</span>;
  }
  if (totalBilled > 0) {
    return <span className="text-sm font-semibold text-emerald-700">All paid</span>;
  }
  return <span className="text-sm text-slate-500">No charges yet</span>;
}

// One queue card on the landing page. The whole card opens the queue; the
// "⋯" menu holds Delete.
export function QueueDeckCard({ queue, onDelete }: Props) {
  return (
    <article className="relative flex flex-col rounded-2xl border border-sky-100 bg-white p-4 shadow-sm transition-colors hover:border-sky-300 focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-100">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
          {gameModeLabel(queue.gameMode)}
        </span>
        <QueueCardMenu queueName={queue.name} onDelete={onDelete} />
      </div>

      <h3 className="mt-2 truncate text-lg font-black tracking-tight text-slate-900">
        {/* The link's ::after covers the whole card, so a click anywhere opens it. */}
        <Link
          to={getQueuePath(queue.id)}
          className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']"
        >
          {queue.name}
        </Link>
      </h3>

      <p className="mt-0.5 text-sm text-slate-500">
        {pluralizePlayer(queue.playerCount)} ·{" "}
        <time dateTime={queue.updatedAt} title={formatDateTime(queue.updatedAt)}>
          {formatRelativeDate(queue.updatedAt)}
        </time>
      </p>

      <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
        <div>
          <p className="text-xs font-medium text-slate-500">Collected</p>
          {/* Money actually received (old bug #8 showed the total billed here). */}
          <p className="text-base font-bold text-slate-900">{formatCurrency(queue.totalCollected)}</p>
        </div>
        <PaymentStatus totalBilled={queue.totalBilled} totalCollected={queue.totalCollected} />
      </div>
    </article>
  );
}
