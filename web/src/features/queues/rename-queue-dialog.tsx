import { useEffect, useId, useState } from "react";

import { CloseButton } from "@/components/close-button";
import { useRenameQueue } from "@/features/queues/use-queues";
import { EditPlanDialog } from "@/features/signups/edit-plan-dialog";
import { useToast } from "@/hooks/use-toast";
import { toUserMessage } from "@/services/errors";
import type { QueueStatus } from "@/services/queues";

const MAX_NAME_LENGTH = 60;

// The "⋯ → Edit" of a queue in a list: a planned session edits its name, date
// and time; a live queue just its name.
export function EditQueueDialog({
  queue,
  onClose,
}: {
  queue: { id: string; name: string; status: QueueStatus; startsAt: string | null };
  onClose: () => void;
}) {
  if (queue.status === "planned") {
    return <EditPlanDialog queue={{ id: queue.id, name: queue.name, startsAt: queue.startsAt }} onClose={onClose} />;
  }
  return <RenameQueueDialog queue={queue} onClose={onClose} />;
}

// "Rename queue" (owner, 2026-10-21): from the landing card, the Queues popup
// and the Courts tab "⋯" menus. Closes only with ✕, Cancel or Esc.
export function RenameQueueDialog({ queue, onClose }: { queue: { id: string; name: string }; onClose: () => void }) {
  const ids = useId();
  const rename = useRenameQueue();
  const { showToast } = useToast();
  const [name, setName] = useState(queue.name);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !rename.isPending) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [rename.isPending, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return setError("Please enter a queue name");
          if (trimmed.length > MAX_NAME_LENGTH) return setError(`Queue name must be ${MAX_NAME_LENGTH} characters or less`);
          if (trimmed === queue.name) return onClose();
          rename.mutate(
            { queueId: queue.id, name: trimmed },
            {
              onSuccess: () => {
                showToast("Queue renamed", "success");
                onClose();
              },
              onError: (failure) => setError(toUserMessage(failure, "Could not rename the queue. Please try again.")),
            },
          );
        }}
        className="w-full max-w-sm rounded-[28px] border border-sky-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id={`${ids}-title`} className="text-lg font-bold text-slate-900">
            Rename queue
          </h2>
          <CloseButton label="Close rename queue" onClick={onClose} disabled={rename.isPending} size="sm" />
        </div>
        <label htmlFor={`${ids}-name`} className="mt-4 mb-1.5 block text-sm font-medium text-slate-700">
          Queue name
        </label>
        <input
          id={`${ids}-name`}
          type="text"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autoFocus
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          className={`h-11 w-full rounded-xl border px-3.5 text-sm text-slate-800 outline-none focus:ring-2 ${
            error ? "border-rose-300 focus:ring-rose-100" : "border-slate-200 focus:border-blue-400 focus:ring-blue-100"
          }`}
        />
        {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={rename.isPending}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={rename.isPending}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
          >
            {rename.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
