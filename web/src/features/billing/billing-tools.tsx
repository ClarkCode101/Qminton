import { useDeferredValue, useEffect, useRef, useState } from "react";

import { BillingModal } from "@/features/billing/billing-modal";
import { fieldError, isValid, noteSchema, previewAmount, signedAmountSchema } from "@/features/billing/billing-form-schema";
import { formatSharePreview, getBillingPlayerStatus, splitAmountEvenly } from "@/features/billing/billing-roster";
import { SKILL_LABELS } from "@/features/players/player-status";
import type { Player } from "@/services/players";

type ToolMode = "single" | "shared";

interface Props {
  // Players the one-player adjustment can pick (includes removed players with a billing record).
  adjustablePlayers: Player[];
  // Players who can split a shared fee (players still in the queue).
  activePlayers: Player[];
  busy: boolean;
  onAdjust: (input: { playerId: number; amount: number; note: string }) => Promise<void>;
  onSharedFee: (input: { playerIds: number[]; totalAmount: number; note: string }) => Promise<void>;
  onClose: () => void;
}

const byName = (left: Player, right: Player) => left.name.localeCompare(right.name);

function matchesSearch(player: Player, query: string): boolean {
  if (!query) return true;
  return [player.name, SKILL_LABELS[player.skill], getBillingPlayerStatus(player).label]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function gamesText(player: Player): string {
  return `${SKILL_LABELS[player.skill]} • ${player.games_played} game${player.games_played === 1 ? "" : "s"}`;
}

function ErrorText({ message }: { message: string | null }) {
  return message ? <p className="-mt-1.5 text-xs text-rose-600">{message}</p> : null;
}

// "Advanced billing tools": one-player adjustment or a fee split across players.
export function BillingTools({ adjustablePlayers, activePlayers, busy, onAdjust, onSharedFee, onClose }: Props) {
  const [mode, setMode] = useState<ToolMode>("single");

  return (
    <BillingModal
      title="Advanced billing tools"
      description="Refunds, manual corrections, and shared extra fees for selected players."
      badge="Manual tools"
      onClose={onClose}
      maxWidthClassName="max-w-4xl"
    >
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Adjustment type</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 sm:max-w-xl">
                Choose whether this entry applies to one player or gets split across a selected group.
              </p>
            </div>
            <div className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-white p-1 shadow-sm">
              {(
                [
                  ["single", "One player"],
                  ["shared", "Split fee"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  className={`inline-flex h-full items-center justify-center rounded-full px-3.5 text-sm font-semibold transition-colors cursor-pointer ${
                    mode === value ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {mode === "single" ? (
            <SingleAdjustment players={adjustablePlayers} busy={busy} onAdjust={onAdjust} />
          ) : (
            <SharedFee players={activePlayers} busy={busy} onSharedFee={onSharedFee} />
          )}
        </div>
      </div>
    </BillingModal>
  );
}

function SingleAdjustment({
  players,
  busy,
  onAdjust,
}: {
  players: Player[];
  busy: boolean;
  onAdjust: Props["onAdjust"];
}) {
  const sortedPlayers = [...players].sort(byName);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Like the old app: the first player is picked until you choose another.
  const selected = players.find((player) => player.id === selectedId) ?? players[0] ?? null;
  const query = deferredSearch.trim().toLowerCase();
  const options = sortedPlayers.filter((player) => matchesSearch(player, query));
  const canSave = selected !== null && isValid(signedAmountSchema, amount) && isValid(noteSchema, note) && !busy;

  useEffect(() => {
    if (!isPickerOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setIsPickerOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isPickerOpen]);

  const save = async () => {
    if (!canSave || !selected) return;
    try {
      await onAdjust({ playerId: selected.id, amount: Number(amount.trim()), note: note.trim() });
      setAmount("");
      setNote("");
    } catch {
      // Toast already shown; keep what was typed.
    }
  };

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Single-player adjustment</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Use this for a one-off charge, refund, or correction for exactly one player.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
          Refund or charge
        </span>
      </div>

      <div className="space-y-3">
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            onClick={() => setIsPickerOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={isPickerOpen}
            aria-label={`Player: ${selected?.name ?? "none"}`}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-left text-sm text-slate-800 outline-none transition hover:border-slate-300 focus:border-sky-400 cursor-pointer"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-slate-900">{selected?.name ?? "Select player"}</div>
              {selected && <div className="mt-0.5 text-xs text-slate-500">{gamesText(selected)}</div>}
            </div>
            <svg
              className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isPickerOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {isPickerOpen && (
            <div className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
              <div className="border-b border-slate-100 p-3">
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search players"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-500 focus:border-sky-400"
                  placeholder="Search players"
                  autoFocus
                />
              </div>
              <div role="listbox" aria-label="Players" className="max-h-56 space-y-2 overflow-y-auto p-2">
                {options.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                    No players match this search.
                  </div>
                ) : (
                  options.map((player) => {
                    const status = getBillingPlayerStatus(player);
                    const isSelected = player.id === selected?.id;
                    return (
                      <button
                        key={player.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          setSelectedId(player.id);
                          setIsPickerOpen(false);
                          setSearch("");
                        }}
                        className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left transition cursor-pointer ${
                          isSelected ? "border-sky-300 bg-sky-100/70" : "border-transparent bg-slate-50 hover:border-slate-200"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800">{player.name}</div>
                          <div className="text-xs text-slate-500">{gamesText(player)}</div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${status.className}`}>
                          {status.label}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
        <input
          type="text"
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-label="Adjustment amount"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-500 focus:border-sky-400"
          placeholder="0"
        />
        <ErrorText message={fieldError(signedAmountSchema, amount)} />
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          aria-label="Adjustment note"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-500 focus:border-sky-400"
          placeholder="Reason for the adjustment"
        />
        <ErrorText message={fieldError(noteSchema, note)} />
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave}
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          {busy ? "Saving..." : "Save adjustment"}
        </button>
      </div>
    </div>
  );
}

function SharedFee({
  players,
  busy,
  onSharedFee,
}: {
  players: Player[];
  busy: boolean;
  onSharedFee: Props["onSharedFee"];
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const availableIds = new Set(players.map((player) => player.id));
  const effectiveIds = selectedIds.filter((id) => availableIds.has(id));
  const query = deferredSearch.trim().toLowerCase();
  const options = [...players].sort(byName).filter((player) => matchesSearch(player, query));
  const selectedPlayers = players.filter((player) => effectiveIds.includes(player.id));
  const shares = splitAmountEvenly(previewAmount(amount), effectiveIds.length);
  const canSave = effectiveIds.length > 0 && isValid(signedAmountSchema, amount) && isValid(noteSchema, note) && !busy;

  const toggle = (playerId: number) =>
    setSelectedIds((ids) => (ids.includes(playerId) ? ids.filter((id) => id !== playerId) : [...ids, playerId]));

  const selectVisible = () => setSelectedIds((ids) => [...new Set([...ids, ...options.map((player) => player.id)])]);

  const save = async () => {
    if (!canSave) return;
    try {
      await onSharedFee({ playerIds: effectiveIds, totalAmount: Number(amount.trim()), note: note.trim() });
      setAmount("");
      setNote("");
      setSelectedIds([]);
      setSearch("");
    } catch {
      // Toast already shown; keep the selection.
    }
  };

  const inputClass =
    "w-full rounded-2xl border border-sky-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-500 focus:border-sky-400";

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Shared additional fee</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Add one extra fee, then pick exactly who splits it. Any remaining peso goes to the first selected players.
          </p>
        </div>
        <div className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-medium text-sky-700">
          {effectiveIds.length} selected
        </div>
      </div>

      <div className="space-y-3">
        <input
          type="text"
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-label="Shared fee amount"
          className={inputClass}
          placeholder="0"
        />
        <ErrorText message={fieldError(signedAmountSchema, amount)} />
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          aria-label="Shared fee note"
          className={inputClass}
          placeholder="What is this fee for?"
        />
        <ErrorText message={fieldError(noteSchema, note)} />

        <div className="rounded-2xl border border-sky-200 bg-white p-2.5 sm:p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Choose players</span>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={selectVisible}
                className="rounded-full border border-sky-200 px-3 py-1 text-sky-700 transition hover:bg-sky-50 cursor-pointer"
              >
                Select visible
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-50 cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search players to split with"
            className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-500 focus:border-sky-400"
            placeholder="Search players"
          />
          <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
            {options.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                No players match this search.
              </div>
            ) : (
              options.map((player) => {
                const status = getBillingPlayerStatus(player);
                const isSelected = effectiveIds.includes(player.id);
                return (
                  <label
                    key={player.id}
                    className={`flex cursor-pointer items-center justify-between rounded-2xl border px-3 py-2.5 transition ${
                      isSelected ? "border-sky-300 bg-sky-100/70" : "border-transparent bg-slate-50 hover:border-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(player.id)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <div className="text-sm font-medium text-slate-800">{player.name}</div>
                        <div className="text-xs text-slate-500">{gamesText(player)}</div>
                      </div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${status.className}`}>
                      {status.label}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-sky-200 bg-white px-4 py-2.5 text-sm text-slate-600">
          <div className="font-medium text-slate-800">Split preview</div>
          <div className="mt-1 text-sm text-slate-500">{formatSharePreview(shares)}</div>
          {selectedPlayers.length > 0 && (
            <div className="mt-2 text-xs text-slate-500">{selectedPlayers.map((player) => player.name).join(", ")}</div>
          )}
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave}
          className="w-full rounded-2xl border border-blue-600 bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-blue-300 disabled:bg-blue-300 cursor-pointer"
        >
          {busy ? "Saving..." : "Save shared fee"}
        </button>
      </div>
    </div>
  );
}
