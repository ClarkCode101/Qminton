import { useEffect, useId, useState } from "react";

import { CloseButton } from "@/components/close-button";
import type { Signup } from "@/services/signups";

interface Props {
  signups: Signup[];
  busy: boolean;
  onStart: (arrivedIds: number[]) => void;
  onClose: () => void;
}

// "Who came?" before the games start. Those marked here become players and are
// billed the court fee; the ones marked "not here" join on break (often just
// late) and are billed when first marked Ready (owner, 2026-10-21).
// Redesigned (owner, 2026-10-21): with ~50 people the old one-column checkbox
// list showed ~10 names and the no-shows were hard to find. Now a grid of name
// tiles (2–3 per row, ~40 visible), everyone "here" at first: tap the ones who
// didn't come (gray, crossed out). Search box + "47 here · 2 not here".
export function StartSessionDialog({ signups, busy, onStart, onClose }: Props) {
  const ids = useId();
  const [notHere, setNotHere] = useState<Set<number>>(() => new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  const toggle = (id: number) =>
    setNotHere((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Numbers stay the sign-up order while searching.
  const numbered = signups.map((signup, index) => ({ signup, number: index + 1 }));
  const query = search.trim().toLowerCase();
  const shown = query ? numbered.filter(({ signup }) => signup.name.toLowerCase().includes(query)) : numbered;
  const hereCount = signups.length - notHere.size;
  const arrivedIds = signups.filter((signup) => !notHere.has(signup.id)).map((signup) => signup.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-sky-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-4 sm:px-6">
          <div>
            <h2 id={`${ids}-title`} className="text-lg font-bold text-slate-900">
              Who came?
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Tap anyone who isn't here yet. They join on break and are charged when you mark them Ready.
            </p>
          </div>
          <CloseButton label="Close start session" onClick={onClose} disabled={busy} size="sm" />
        </div>

        {signups.length > 0 && (
          <div className="flex flex-col gap-2 border-b border-sky-100 px-5 pb-3 pt-3 sm:flex-row sm:items-center sm:px-6">
            <label htmlFor={`${ids}-search`} className="sr-only">
              Search name
            </label>
            <input
              id={`${ids}-search`}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name"
              className="h-10 w-full min-w-0 rounded-xl sm:flex-1 border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none placeholder:text-slate-500 focus:border-blue-300 focus:ring-2 focus:ring-sky-100"
            />
            <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
              <p className="text-sm text-slate-600" aria-live="polite">
                <span className="font-semibold text-emerald-700">{hereCount} here</span>
                {notHere.size > 0 && (
                  <>
                    <span className="text-slate-400"> · </span>
                    <span className="font-semibold text-slate-700">{notHere.size} not here</span>
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={() => setNotHere(notHere.size > 0 ? new Set() : new Set(signups.map((signup) => signup.id)))}
                className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                {notHere.size > 0 ? "Mark all here" : "Clear all"}
              </button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 sm:px-6">
          {signups.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No one signed up. You can still start and add players yourself.</p>
          ) : shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No one named "{search.trim()}".</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Signed up">
              {shown.map(({ signup, number }) => {
                const here = !notHere.has(signup.id);
                return (
                  <li key={signup.id}>
                    <button
                      type="button"
                      aria-pressed={here}
                      aria-label={`${signup.name}: ${here ? "here" : "not here"}`}
                      onClick={() => toggle(signup.id)}
                      className={`flex min-h-11 w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                        here
                          ? "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/50"
                          : "border-dashed border-slate-300 bg-slate-100 hover:bg-slate-200/70"
                      }`}
                    >
                      <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{number}</span>
                      {/* Up to 2 lines instead of "Clarence Z…" on phones. */}
                      <span
                        className={`line-clamp-2 min-w-0 flex-1 wrap-break-word text-sm font-semibold leading-tight ${here ? "text-slate-800" : "text-slate-400 line-through"}`}
                      >
                        {signup.name}
                      </span>
                      {here ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      ) : (
                        // Phones: the crossed-out gray tile says it; the words need the room.
                        <span className="hidden shrink-0 text-[11px] font-semibold text-slate-500 sm:inline">Not here</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-sky-100 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
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
            onClick={() => onStart(arrivedIds)}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
          >
            {busy ? "Starting..." : `Start with ${hereCount} player${hereCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
