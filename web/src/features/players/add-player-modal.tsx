import { useEffect, useId, useRef, useState, type ClipboardEvent } from "react";

import { CloseButton } from "@/components/close-button";
import { CheckInPanel } from "@/features/check-in/check-in-panel";
import { MAX_PLAYER_NAME_LENGTH, parseBulkNames } from "@/features/players/bulk-names";
import { SkillSegmented } from "@/features/players/skill-picker";
import type { NewPlayer, SkillLevel } from "@/services/players";

interface Props {
  // Names of players already in the queue, to flag repeats before saving.
  existingNames: string[];
  // Should throw if saving fails; the modal then stays open with the list.
  onAdd: (players: NewPlayer[]) => Promise<void>;
  // For the "QR check-in" tab (players add themselves).
  queueId: string;
  queueName: string;
  onClose: () => void;
  // "signups" = adding to a planned session's sign-up list: no QR tab (the
  // share card already has the link) and repeats read "Already on the list".
  target?: "queue" | "signups";
}

interface Entry {
  name: string;
  skill: SkillLevel;
}

// "Add Players": one way for 1 or 30 players (replaces the old Single / Bulk
// tabs). Type a name + Enter, or paste a list; everyone waits in a list where
// skills can be set, then one button adds them all. Names already in the queue
// or too long are flagged and left out. A second tab shows the QR players can
// scan to add themselves (owner's addition). Centered dialog on desktop,
// bottom sheet on phones.
export function AddPlayerModal({ existingNames, queueId, queueName, onAdd, onClose, target = "queue" }: Props) {
  const forSignups = target === "signups";
  const ids = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  // Skill for the name being typed (and the next ones), picked under the name box.
  const [defaultSkill, setDefaultSkill] = useState<SkillLevel>("beginner");
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Two ways to add: type names here, or let players check in with a QR code.
  const [tab, setTab] = useState<"type" | "qr">("type");

  const inQueue = new Set(existingNames.map((name) => name.toLowerCase()));
  const problem = (entry: Entry): string | null => {
    if (inQueue.has(entry.name.toLowerCase())) return forSignups ? "Already on the list" : "Already in the queue";
    if (entry.name.length > MAX_PLAYER_NAME_LENGTH) return `Too long (max ${MAX_PLAYER_NAME_LENGTH} characters)`;
    return null;
  };
  const addable = entries.filter((entry) => problem(entry) === null);
  // Name(s) still in the box, not yet in the list: they count when pressing Add.
  const listedNames = new Set(entries.map((entry) => entry.name.toLowerCase()));
  const typed: Entry[] = parseBulkNames(draft)
    .filter((name) => !listedNames.has(name.toLowerCase()))
    .map((name) => ({ name, skill: defaultSkill }));
  const typedAddable = typed.filter((entry) => problem(entry) === null);
  const addCount = addable.length + typedAddable.length;
  // Owner (2026-10-21): nothing is added while a name has a problem (already
  // in, or too long). Fix or remove those first, so nobody is skipped unseen.
  const problemEntries = entries.filter((entry) => problem(entry) !== null);
  const blocked = problemEntries.length > 0 || typed.some((entry) => problem(entry) !== null);
  const duplicateCount = problemEntries.filter((entry) => inQueue.has(entry.name.toLowerCase())).length;
  const removeProblems = () => setEntries((current) => current.filter((entry) => problem(entry) === null));
  const sameSkill = entries.length > 0 && entries.every((entry) => entry.skill === entries[0].skill) ? entries[0].skill : null;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onClose]);

  // Adds names to the list (one typed name or a pasted list); returns the new list.
  const addNames = (text: string): Entry[] => {
    const names = parseBulkNames(text);
    if (names.length === 0) return entries;
    const listed = new Set(entries.map((entry) => entry.name.toLowerCase()));
    const fresh = names.filter((name) => !listed.has(name.toLowerCase()));
    const repeated = names.length - fresh.length;
    setNotice(repeated > 0 ? `${repeated === 1 ? "1 name is" : `${repeated} names are`} already in the list.` : null);
    const next = [...entries, ...fresh.map((name) => ({ name, skill: defaultSkill }))];
    setEntries(next);
    setDraft("");
    return next;
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    // A pasted list (several lines) goes straight into the list.
    if (text.includes("\n")) {
      event.preventDefault();
      addNames(text);
    }
  };

  const setAll = (skill: SkillLevel) => {
    setEntries((current) => current.map((entry) => ({ ...entry, skill })));
  };

  const submit = async () => {
    // A name still in the box counts too, with the skill picked under it. It is
    // saved directly (not shown in the list first), so nothing flickers.
    const players = [...addable, ...typedAddable];
    if (blocked) return;
    if (players.length === 0) {
      inputRef.current?.focus();
      return;
    }
    setIsSaving(true);
    try {
      await onAdd(players);
    } catch {
      // The caller already showed a toast; keep the list.
    } finally {
      setIsSaving(false);
    }
  };

  const submitLabel = `Add ${addCount > 0 ? `${addCount} ` : ""}player${addCount === 1 ? "" : "s"}`;

  return (
    // No close on a tap outside: only ✕, Cancel or Esc, so typed names aren't lost.
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl border border-sky-200 bg-white shadow-xl sm:max-w-xl sm:rounded-2xl"
      >
        {/* Drag-handle look on phones (bottom sheet) */}
        <div className="flex justify-center pt-3 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-sky-300" />
        </div>

        <div className="flex items-start justify-between gap-3 px-5 pt-4 sm:px-6 sm:pt-5">
          <h2 id={`${ids}-title`} className="text-lg font-semibold text-slate-800">
            {forSignups ? "Add to the list" : "Add Players"}
          </h2>
          <CloseButton label="Close add players" onClick={onClose} disabled={isSaving} size="sm" />
        </div>

        {!forSignups && (
          <div role="tablist" aria-label="How to add players" className="mx-5 mt-3 flex rounded-xl bg-slate-100 p-1 sm:mx-6">
            {(
              [
                ["type", "Type names"],
                ["qr", "QR check-in"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                disabled={isSaving}
                className={`inline-flex min-h-9 flex-1 items-center justify-center rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  tab === value ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {tab === "qr" && !forSignups ? (
          <>
            <div className="mt-4 min-h-0 flex-1 overflow-y-auto border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:px-6">
              <CheckInPanel queueId={queueId} queueName={queueName} />
            </div>
            <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
              <button
                type="button"
                onClick={onClose}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Owner (2026-10-21): people look at the controls, not at text. No
                instructions: the name box, the + and the skill picker say it. */}
            <form
              noValidate
              // One line from 640px: [Name] [skill] [+]. Phones: the skill goes under the name.
              className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:px-6"
              onSubmit={(event) => {
                event.preventDefault();
                addNames(draft);
                inputRef.current?.focus();
              }}
            >
              <label htmlFor={`${ids}-name`} className="sr-only">
                Player name
              </label>
              <input
                ref={inputRef}
                id={`${ids}-name`}
                type="text"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setNotice(null);
                }}
                onPaste={handlePaste}
                placeholder="Name"
                autoComplete="off"
                className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-base text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-sky-100"
                autoFocus
              />
              {/* The skill for the name being typed, right beside it (owner). */}
              <div className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                <SkillSegmented value={defaultSkill} onChange={setDefaultSkill} label="Skill level for the next player" fill />
              </div>
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="Add to list"
                title="Add to list (Enter)"
                className="col-start-2 row-start-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-200 sm:col-start-3 bg-sky-50 text-sky-700 transition-colors hover:bg-sky-100 cursor-pointer disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-white disabled:text-slate-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </form>
            {/* The one hint kept (owner): many names can be added at once. */}
            <p className="mt-1.5 px-5 text-xs text-slate-500 sm:px-6">Adding many? Paste a list of names, one per line.</p>
            {notice && <p className="mt-2 px-5 text-xs font-medium text-amber-700 sm:px-6">{notice}</p>}


            <div className="mt-4 flex min-h-0 flex-1 flex-col border-t border-slate-100 bg-slate-50/80">
              {entries.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-400 sm:px-6">Names you add show up here</p>
              ) : (
                <>
                  <div className="flex flex-col gap-2 px-5 pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">To add ({entries.length})</p>
                    {entries.length >= 2 && (
                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap text-xs font-medium text-slate-500">Set all:</span>
                        <SkillSegmented value={sameSkill} onChange={setAll} label="Skill level for everyone" fill />
                      </div>
                    )}
                  </div>
                  <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-5 pb-3 sm:px-6">
                    {entries.map((entry) => {
                      const issue = problem(entry);
                      return (
                        // Phones: name + ✕ on top, skill picker underneath. From 640px: one line.
                        <li
                          key={entry.name.toLowerCase()}
                          className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-xl border bg-white px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] ${
                            issue ? "border-amber-200" : "border-slate-100"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-800">{entry.name}</p>
                            {issue && <p className="text-xs font-medium text-amber-700">{issue}</p>}
                          </div>
                          {!issue && (
                            <div className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                              <SkillSegmented
                                value={entry.skill}
                                onChange={(skill) =>
                                  setEntries((current) => current.map((item) => (item.name === entry.name ? { ...item, skill } : item)))
                                }
                                label={`Skill level for ${entry.name}`}
                                fill
                              />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => setEntries((current) => current.filter((item) => item.name !== entry.name))}
                            aria-label={`Remove ${entry.name} from the list`}
                            className="col-start-2 row-start-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 cursor-pointer sm:col-start-3"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                              <path d="m6 6 8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                              <path d="m14 6-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                            </svg>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>

            {problemEntries.length > 0 && (
              <div role="alert" className="flex items-center justify-between gap-3 border-t border-amber-200 bg-amber-50 px-5 py-2.5 sm:px-6">
                <p className="text-sm font-medium text-amber-800">
                  {duplicateCount === problemEntries.length
                    ? `${problemEntries.length} ${problemEntries.length === 1 ? "name is" : "names are"} already ${forSignups ? "on the list" : "in the queue"}.`
                    : `${problemEntries.length} ${problemEntries.length === 1 ? "name needs" : "names need"} fixing.`}
                </p>
                <button
                  type="button"
                  onClick={removeProblems}
                  className="inline-flex min-h-9 shrink-0 items-center rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 cursor-pointer"
                >
                  {problemEntries.length === 1 ? "Remove it" : "Remove them"}
                </button>
              </div>
            )}

            <div className="flex gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={isSaving || addCount === 0 || blocked}
                className="h-10 flex-2 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? "Adding..." : submitLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
