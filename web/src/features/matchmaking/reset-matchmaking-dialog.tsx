import { useEffect, useId, useState } from "react";

interface Props {
  busy: boolean;
  onConfirm: (includePlayersOnBreak: boolean) => Promise<void>;
  onClose: () => void;
}

// "Reset matchmaking?" (ported from the old QueueCourtsTab overlay, same text).
export function ResetMatchmakingDialog({ busy, onConfirm, onClose }: Props) {
  const ids = useId();
  const [includePlayersOnBreak, setIncludePlayersOnBreak] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-[28px] border border-rose-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-rose-100 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-500">Reset Matchmaking</p>
          <h3 id={`${ids}-title`} className="mt-1 text-xl font-black tracking-tight text-slate-900">
            Reset matchmaking?
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            This clears the anti-repeat matchmaking memory, removes queued matches, clears active courts, and returns
            players to the queue. Match Log will be preserved.
          </p>
          <label htmlFor={`${ids}-break`} className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50/40 px-3.5 py-3">
            <input
              id={`${ids}-break`}
              type="checkbox"
              checked={includePlayersOnBreak}
              onChange={(event) => setIncludePlayersOnBreak(event.target.checked)}
              disabled={busy}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-500 focus:ring-rose-200 disabled:cursor-not-allowed"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Include players on break</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                Checked: on-break players become Ready after the reset. Unchecked: they stay on break.
              </span>
            </span>
          </label>
        </div>

        <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm(includePlayersOnBreak)}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-rose-500 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Resetting..." : "Reset Matchmaking"}
          </button>
        </div>
      </div>
    </div>
  );
}
