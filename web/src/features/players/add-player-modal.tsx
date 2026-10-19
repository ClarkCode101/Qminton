import { useEffect, useId, useState } from "react";

import { MAX_PLAYER_NAME_LENGTH, parseBulkNames } from "@/features/players/bulk-names";
import { SKILL_LABELS, SKILLS } from "@/features/players/player-status";
import { CompactSkillPicker, SkillIcon, SkillPicker } from "@/features/players/skill-picker";
import type { NewPlayer, SkillLevel } from "@/services/players";

interface Props {
  // Both should throw if saving fails; the modal then stays open.
  onAdd: (player: NewPlayer) => Promise<void>;
  onBulkAdd: (players: NewPlayer[]) => Promise<void>;
  onClose: () => void;
}

type Mode = "single" | "bulk";

const inputClass =
  "w-full rounded-lg border border-sky-200 bg-sky-50/50 p-2.5 text-sm text-slate-800 placeholder:text-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500";
const cancelButtonClass =
  "flex-1 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-sky-50 cursor-pointer";
const submitButtonClass =
  "flex-1 rounded-lg border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-blue-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";

// "Add New Player" (ported from the old AddPlayerModal). One layout for both
// screen sizes: a centered dialog on desktop, a bottom sheet on phones.
export function AddPlayerModal({ onAdd, onBulkAdd, onClose }: Props) {
  const ids = useId();
  const [mode, setMode] = useState<Mode>("single");
  const [name, setName] = useState("");
  const [skill, setSkill] = useState<SkillLevel>("beginner");
  const [nameError, setNameError] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [playerSkills, setPlayerSkills] = useState<Record<string, SkillLevel>>({});
  const [isSaving, setIsSaving] = useState(false);

  const parsedNames = parseBulkNames(bulkText);
  const tooLongNames = parsedNames.filter((playerName) => playerName.length > MAX_PLAYER_NAME_LENGTH);
  const bulkLabel = `Add${parsedNames.length > 0 ? ` ${parsedNames.length}` : ""} Player${parsedNames.length !== 1 ? "s" : ""}`;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onClose]);

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setName("");
    setSkill("beginner");
    setNameError(null);
    setBulkText("");
    setPlayerSkills({});
  };

  const save = async (action: () => Promise<void>) => {
    setIsSaving(true);
    try {
      await action();
    } catch {
      // The caller already showed a toast; keep what was typed.
    } finally {
      setIsSaving(false);
    }
  };

  const handleSingleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Please enter player name");
      return;
    }
    if (trimmedName.length > MAX_PLAYER_NAME_LENGTH) {
      setNameError(`Player name must be ${MAX_PLAYER_NAME_LENGTH} characters or less`);
      return;
    }
    await save(() => onAdd({ name: trimmedName, skill }));
  };

  const handleBulkSubmit = async () => {
    if (parsedNames.length === 0 || tooLongNames.length > 0) return;
    await save(() => onBulkAdd(parsedNames.map((playerName) => ({ name: playerName, skill: playerSkills[playerName] ?? "beginner" }))));
  };

  const setAllSkills = (nextSkill: SkillLevel) => {
    setPlayerSkills(Object.fromEntries(parsedNames.map((playerName) => [playerName, nextSkill])));
  };

  const tabClass = (tab: Mode) =>
    `-mb-px border-b-2 px-2 pb-2 text-sm font-medium transition-all cursor-pointer ${
      mode === tab ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 backdrop-blur-sm sm:items-center"
      onClick={isSaving ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-sky-200 bg-white px-5 pb-6 shadow-xl sm:max-h-[85vh] sm:w-[90%] sm:max-w-sm sm:rounded-xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Drag-handle look on phones (bottom sheet) */}
        <div className="flex justify-center pb-2 pt-3 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-sky-300" />
        </div>

        <h2 id={`${ids}-title`} className="mb-4 text-lg font-semibold text-slate-800">
          Add New Player
        </h2>

        <div className="mb-4 flex gap-2 border-b border-sky-200" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "single"} onClick={() => switchMode("single")} className={tabClass("single")}>
            Single Player
          </button>
          <button type="button" role="tab" aria-selected={mode === "bulk"} onClick={() => switchMode("bulk")} className={tabClass("bulk")}>
            Bulk Add
          </button>
        </div>

        {mode === "single" ? (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void handleSingleSubmit();
            }}
          >
            <div className="mb-4">
              <label htmlFor={`${ids}-name`} className="mb-2 block text-sm font-medium text-slate-700">
                Player Name
              </label>
              <input
                id={`${ids}-name`}
                type="text"
                value={name}
                maxLength={MAX_PLAYER_NAME_LENGTH}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(null);
                }}
                placeholder="Enter player name"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? `${ids}-name-error` : undefined}
                className={`${inputClass} ${nameError ? "border-rose-300" : ""}`}
                autoFocus
              />
              {nameError && (
                <p id={`${ids}-name-error`} className="mt-2 text-xs font-medium text-rose-600">
                  {nameError}
                </p>
              )}
            </div>
            <div className="mb-5">
              <p className="mb-2 block text-sm font-medium text-slate-700">Skill Level</p>
              <SkillPicker value={skill} onChange={setSkill} />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} disabled={isSaving} className={cancelButtonClass}>
                Cancel
              </button>
              <button type="submit" disabled={isSaving} className={submitButtonClass}>
                {isSaving ? "Adding..." : "Add Player"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="mb-4">
              <label htmlFor={`${ids}-bulk`} className="mb-2 block text-sm font-medium text-slate-700">
                Paste Player List
              </label>
              <textarea
                id={`${ids}-bulk`}
                value={bulkText}
                onChange={(event) => setBulkText(event.target.value)}
                placeholder={"1. Clark\n2. Diego\n3. Lenon"}
                rows={3}
                autoFocus
                aria-describedby={tooLongNames.length > 0 ? `${ids}-bulk-error` : undefined}
                className={`${inputClass} resize-none font-mono`}
              />
              {tooLongNames.length > 0 && (
                <p id={`${ids}-bulk-error`} className="mt-2 text-xs font-medium text-rose-600">
                  Names must be {MAX_PLAYER_NAME_LENGTH} characters or less. Shorten: {tooLongNames.join(", ")}
                </p>
              )}
            </div>

            {parsedNames.length > 0 && (
              <div className="mb-5 rounded-lg border border-sky-200 bg-slate-50 p-3">
                <div className="mb-2">
                  <p className="mb-2 text-xs font-semibold text-slate-600">Set All:</p>
                  <div className="flex gap-1.5">
                    {SKILLS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setAllSkills(option.value)}
                        title={`Set all to ${SKILL_LABELS[option.value]}`}
                        className="flex-1 rounded-lg border-2 border-sky-200 bg-white p-1.5 text-center text-xs font-medium text-slate-600 transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                      >
                        <div className="mb-0.5 flex justify-center">
                          <SkillIcon bars={option.bars} />
                        </div>
                        <span className="text-xs leading-tight">{SKILL_LABELS[option.value]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-sky-200 pt-2">
                  <p className="mb-2 text-xs font-semibold text-slate-600">Skills:</p>
                  <div className="max-h-40 space-y-1.5 overflow-y-auto">
                    {parsedNames.map((playerName) => (
                      <div key={playerName.toLowerCase()} className="flex items-center justify-between gap-2 rounded-lg border border-sky-100 bg-white p-2">
                        <div className="truncate text-sm font-medium text-slate-700">{playerName}</div>
                        <div className="shrink-0">
                          <CompactSkillPicker
                            playerName={playerName}
                            value={playerSkills[playerName] ?? "beginner"}
                            onChange={(nextSkill) => setPlayerSkills((current) => ({ ...current, [playerName]: nextSkill }))}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={onClose} disabled={isSaving} className={cancelButtonClass}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkSubmit()}
                disabled={parsedNames.length === 0 || tooLongNames.length > 0 || isSaving}
                className={submitButtonClass}
              >
                {isSaving ? "Adding..." : bulkLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
