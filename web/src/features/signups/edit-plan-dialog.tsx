import { useEffect, useId, useState } from "react";

import { CloseButton } from "@/components/close-button";
import { DateTimePicker } from "@/components/date-time-picker";
import { isValidDateTimeLocal } from "@/features/queues/queue-form-schema";
import { useRenameQueue } from "@/features/queues/use-queues";
import { useChangePlanDate } from "@/features/signups/use-signups";
import { useToast } from "@/hooks/use-toast";
import { toDateTimeLocalValue } from "@/lib/format";
import { toUserMessage } from "@/services/errors";

export interface PlannedQueueInfo {
  id: string;
  name: string;
  // ISO date and time, null when not set yet.
  startsAt: string | null;
}

// "Edit session" for a planned queue: name, date and time in one place (owner,
// 2026-10-21). Opened from the planned session screen and from the "⋯" menus
// of the landing card and the Queues popup. Closes only with ✕, Cancel or Esc.
export function EditPlanDialog({ queue, onClose }: { queue: PlannedQueueInfo; onClose: () => void }) {
  const ids = useId();
  const rename = useRenameQueue();
  const changeDate = useChangePlanDate(queue.id);
  const { showToast } = useToast();
  const initialDate = queue.startsAt ? toDateTimeLocalValue(queue.startsAt) : "";
  const [name, setName] = useState(queue.name);
  const [value, setValue] = useState(initialDate);
  const [nameError, setNameError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const busy = rename.isPending || changeDate.isPending;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  const save = async () => {
    const trimmed = name.trim();
    const badName = !trimmed ? "Please enter a queue name" : trimmed.length > 60 ? "Queue name must be 60 characters or less" : null;
    const badDate = isValidDateTimeLocal(value) ? null : "Please pick the date and time";
    setNameError(badName);
    setDateError(badDate);
    if (badName || badDate) return;
    if (trimmed !== queue.name) {
      try {
        await rename.mutateAsync({ queueId: queue.id, name: trimmed });
        if (value === initialDate) showToast("Queue renamed", "success");
      } catch (error) {
        setNameError(toUserMessage(error, "Could not rename the queue. Please try again."));
        return;
      }
    }
    if (value !== initialDate) {
      try {
        // Shows its own toast ("Date and time saved", or the error).
        await changeDate.mutateAsync(new Date(value).toISOString());
      } catch {
        return;
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[28px] border border-sky-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id={`${ids}-title`} className="text-lg font-bold text-slate-900">
            Edit session
          </h2>
          <CloseButton label="Close edit session" onClick={onClose} disabled={busy} size="sm" />
        </div>

        <label htmlFor={`${ids}-name`} className="mt-4 mb-1.5 block text-sm font-medium text-slate-700">
          Queue name
        </label>
        <input
          id={`${ids}-name`}
          type="text"
          value={name}
          maxLength={60}
          onChange={(event) => {
            setName(event.target.value);
            setNameError(null);
          }}
          aria-invalid={nameError ? true : undefined}
          className={`h-11 w-full rounded-xl border px-3.5 text-sm text-slate-800 outline-none focus:ring-2 ${
            nameError ? "border-rose-300 focus:ring-rose-100" : "border-slate-200 focus:border-blue-400 focus:ring-blue-100"
          }`}
        />
        {nameError && <p className="mt-1.5 text-xs font-medium text-rose-600">{nameError}</p>}

        <div className="mt-4" />
        <DateTimePicker
          value={value}
          invalid={Boolean(dateError)}
          onChange={(next) => {
            setValue(next);
            setDateError(null);
          }}
        />
        {dateError && <p className="mt-1.5 text-xs font-medium text-rose-600">{dateError}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer disabled:cursor-wait disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
          >
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
