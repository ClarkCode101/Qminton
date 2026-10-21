import { useEffect, useId, useState } from "react";

import { CloseButton } from "@/components/close-button";
import { SKILL_LABELS } from "@/features/players/player-status";
import type { Signup } from "@/services/signups";

interface Props {
  signups: Signup[];
  busy: boolean;
  onStart: (arrivedIds: number[]) => void;
  onClose: () => void;
}

// "Who came?" before the games start. Everyone is ticked at first; untick the
// no-shows. Only those ticked become players and are billed the court fee.
export function StartSessionDialog({ signups, busy, onStart, onClose }: Props) {
  const ids = useId();
  const [arrived, setArrived] = useState<Set<number>>(() => new Set(signups.map((signup) => signup.id)));

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  const toggle = (id: number) =>
    setArrived((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allTicked = arrived.size === signups.length;
  const count = arrived.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-sky-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-sky-100 px-5 py-4">
          <div>
            <h2 id={`${ids}-title`} className="text-lg font-bold text-slate-900">
              Who came?
            </h2>
            <p className="mt-1 text-sm text-slate-500">Untick anyone who didn't show up. They won't be added or charged.</p>
          </div>
          <CloseButton label="Close start session" onClick={onClose} disabled={busy} size="sm" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {signups.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-slate-500">
              No one signed up. You can still start and add players yourself.
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setArrived(allTicked ? new Set() : new Set(signups.map((signup) => signup.id)))}
                className="mb-1 ml-2 text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                {allTicked ? "Untick all" : "Tick all"}
              </button>
              <ul>
                {signups.map((signup, index) => (
                  <li key={signup.id}>
                    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={arrived.has(signup.id)}
                        onChange={() => toggle(signup.id)}
                        className="h-5 w-5 shrink-0 accent-blue-600"
                      />
                      <span className="w-6 text-right text-xs tabular-nums text-slate-400">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{signup.name}</span>
                      <span className="text-xs text-slate-500">{SKILL_LABELS[signup.skill]}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-sky-100 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onStart([...arrived])}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
          >
            {busy ? "Starting..." : `Start with ${count} player${count === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
