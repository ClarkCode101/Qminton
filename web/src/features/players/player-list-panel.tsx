import { useState, type ReactNode } from "react";

import { PlayerCard } from "@/features/players/player-card";
import { countPlayersByFilter, FILTER_OPTIONS, getVisiblePlayers, type PlayerFilter } from "@/features/players/player-status";
import type { Player } from "@/services/players";

interface Props {
  players: Player[];
  onAdd: () => void;
  onRemove: (player: Player) => void;
  onTogglePause: (player: Player) => void;
  onMoveToBottom: (player: Player) => void;
  headerActions?: ReactNode;
  presentation?: "sidebar" | "expanded";
}

// The Players panel: header, search, status filter and the player cards
// (ported from the old QueueCard). "sidebar" = next to the courts,
// "expanded" = the big overlay with filter chips and counts.
export function PlayerListPanel({
  players,
  onAdd,
  onRemove,
  onTogglePause,
  onMoveToBottom,
  headerActions,
  presentation = "sidebar",
}: Props) {
  const [flippedPlayerId, setFlippedPlayerId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<PlayerFilter>("all");
  const isExpanded = presentation === "expanded";

  const visibleEntries = getVisiblePlayers(players, searchQuery, filter);
  const counts = countPlayersByFilter(players);
  const filterLabel = FILTER_OPTIONS.find((option) => option.value === filter)?.label ?? "All";
  const trimmedSearch = searchQuery.trim();

  const changeSearch = (value: string) => {
    setSearchQuery(value);
    setFlippedPlayerId(null);
  };
  const changeFilter = (value: PlayerFilter) => {
    setFilter(value);
    setFlippedPlayerId(null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-sky-200 bg-white shadow-sm">
      <div className="shrink-0 border-b border-sky-100 bg-white/95 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold leading-none text-slate-800">Players</h2>
            <p className="mt-1 text-xs text-slate-500">
              {players.length} player{players.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {headerActions}
            <button
              type="button"
              onClick={onAdd}
              className="hidden h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 cursor-pointer md:inline-flex"
            >
              Add Player
            </button>
          </div>
        </div>

        {players.length > 0 && (
          <div className="mt-3 flex min-w-0 items-center gap-2">
            <label className="relative min-w-0 flex-1 rounded-2xl border border-slate-100 bg-white px-2.5 shadow-sm transition-colors focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-sky-100">
              <span className="sr-only">Search players</span>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M14.17 14.17 18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <circle cx="8.75" cy="8.75" r="5.75" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => changeSearch(event.target.value)}
                placeholder="Search players"
                className="h-11 w-full bg-transparent pl-9 pr-10 text-sm text-slate-700 outline-none placeholder:text-slate-500"
              />
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  onClick={() => changeSearch("")}
                  className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-100 bg-white text-slate-400 transition-colors hover:border-slate-200 hover:text-slate-600 cursor-pointer"
                  aria-label="Clear player search"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="m6 6 8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="m14 6-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </label>

            <label className="relative block w-28 shrink-0 rounded-2xl border border-slate-100 bg-white px-2.5 shadow-sm transition-colors focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-sky-100">
              <span className="sr-only">Filter players by status</span>
              <select
                value={filter}
                onChange={(event) => changeFilter(event.target.value as PlayerFilter)}
                className="h-11 w-full appearance-none bg-transparent px-3 pr-7 text-xs font-semibold text-slate-700 outline-none"
              >
                {FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </label>
          </div>
        )}

        {isExpanded && players.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {FILTER_OPTIONS.map((option) => {
              const isActive = filter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => changeFilter(option.value)}
                  aria-pressed={isActive}
                  className={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    isActive
                      ? "border-sky-200 bg-sky-50 text-sky-700"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  }`}
                >
                  <span>{option.label}</span>
                  <span
                    className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      isActive ? "bg-white text-sky-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {counts[option.value]}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {players.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">No players yet</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/80 p-3">
          {visibleEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-sky-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
              No players match {trimmedSearch.length > 0 ? `"${trimmedSearch}"` : filterLabel.toLowerCase()}.
            </div>
          ) : (
            <section className={`overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm ${isExpanded ? "p-3" : "p-2.5"}`}>
              <div className={`grid grid-cols-1 ${isExpanded ? "gap-3 xl:grid-cols-2" : "gap-2"}`}>
                {visibleEntries.map(({ player, status }) => (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    status={status}
                    presentation={presentation}
                    isFlipped={flippedPlayerId === player.id}
                    onToggleFlip={() => setFlippedPlayerId((current) => (current === player.id ? null : player.id))}
                    onRemove={onRemove}
                    onTogglePause={onTogglePause}
                    onMoveToBottom={onMoveToBottom}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
