import { useEffect, useState, type ReactNode } from "react";

import { getEmptyCourts } from "@/features/courts/court-view";
import { CourtsGrid } from "@/features/courts/courts-grid";
import { PlayerListPanel } from "@/features/players/player-list-panel";
import { formatCurrency } from "@/lib/format";
import type { Player } from "@/services/players";
import type { Queue } from "@/services/queues";

interface Props {
  queue: Queue;
  players: Player[];
  isSavingCourtCount: boolean;
  onChangeCourtCount: (courtCount: number) => void;
  onShowAddPlayer: () => void;
  onRemovePlayer: (player: Player) => void;
  onTogglePause: (player: Player) => void;
  onMoveToBottom: (player: Player) => void;
}

const sidebarButtonClass =
  "group relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sky-100 bg-white text-slate-500 transition-colors hover:border-sky-200 hover:text-blue-600 focus-visible:outline-none focus-visible:border-sky-200 focus-visible:text-blue-600 cursor-pointer";

function SidebarButton({ label, onClick, className = sidebarButtonClass, children }: { label: string; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className={className}>
      {children}
      <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
        {label}
      </span>
    </button>
  );
}

function RateChip({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3 py-1 text-slate-700 ${
        muted ? "border-slate-200 bg-white shadow-sm" : "border-sky-100 bg-sky-50/70"
      }`}
    >
      <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${muted ? "text-slate-500" : "text-sky-700"}`}>{label}</span>
      <span className={`h-3.5 w-px ${muted ? "bg-slate-200" : "bg-sky-100"}`} aria-hidden="true" />
      <span className="font-semibold text-slate-900">{value}</span>
    </span>
  );
}

const courtCountButtonClass =
  "inline-flex h-7 w-7 items-center justify-center rounded-full text-base font-black leading-none text-slate-700 transition-colors hover:bg-sky-50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40";

// The Courts tab layout (ported from the old QueueCourtsTab). Live so far:
// players sidebar (step 5) and court count +/- (step 6). Courts show as
// available until matches exist; Start Next Match, Up Next, Match Log and
// Reset arrive in steps 7–9.
export function CourtsTab({
  queue,
  players,
  isSavingCourtCount,
  onChangeCourtCount,
  onShowAddPlayer,
  onRemovePlayer,
  onTogglePause,
  onMoveToBottom,
}: Props) {
  const [playersCollapsed, setPlayersCollapsed] = useState(false);
  const [playersExpanded, setPlayersExpanded] = useState(false);
  const courts = getEmptyCourts(queue.court_count);

  useEffect(() => {
    if (!playersExpanded) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPlayersExpanded(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [playersExpanded]);

  const playerHandlers = { players, onAdd: onShowAddPlayer, onRemove: onRemovePlayer, onTogglePause, onMoveToBottom };

  return (
    <div className="app-shell-safe-bottom flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,#eff6ff,#f8fbff_36%,#eef6ff)] [scrollbar-gutter:stable_both-edges] md:overflow-hidden">
      {playersExpanded && (
        <div className="fixed inset-0 z-50 flex justify-center bg-slate-950/35 p-3 backdrop-blur-sm sm:p-4" onClick={() => setPlayersExpanded(false)}>
          <div className="h-full w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <PlayerListPanel
              {...playerHandlers}
              presentation="expanded"
              headerActions={
                <SidebarButton
                  label="Close expanded players"
                  onClick={() => setPlayersExpanded(false)}
                  className="group relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-500 shadow-sm transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 cursor-pointer"
                >
                  <svg className="h-8 w-8" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="m6 6 8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="m14 6-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </SidebarButton>
              }
            />
          </div>
        </div>
      )}

      <div className="mx-auto h-full w-full max-w-450 p-4 sm:p-5 lg:p-6">
        <div
          className={
            playersCollapsed
              ? "grid h-full min-h-0 grid-cols-1 gap-3 lg:gap-4"
              : "grid h-full min-h-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(264px,292px)] lg:grid-cols-[minmax(0,1fr)_minmax(292px,324px)] lg:gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,352px)]"
          }
        >
          <section className="order-1 min-w-0 md:min-h-0">
            <section className="rounded-[28px] border border-sky-200 bg-white/95 shadow-sm backdrop-blur-sm md:flex md:h-full md:min-h-0 md:flex-col">
              <div className="border-b border-sky-100 px-4 py-3 sm:px-5 sm:py-4">
                <div className="flex flex-col gap-2.5 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-500">Live Courts</p>
                    <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1.5">
                      <h1 className="truncate text-xl font-black tracking-tight text-slate-900 sm:text-[1.55rem]">{queue.name}</h1>
                      <div className="flex flex-wrap items-center gap-2 text-[13px] sm:text-sm">
                        <RateChip label="Shuttle/Game" value={formatCurrency(queue.game_rate)} />
                        <RateChip label="Court Fee" value={formatCurrency(queue.court_fee)} muted />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onShowAddPlayer}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer md:hidden"
                  >
                    Add Player
                  </button>
                </div>
              </div>

              <div className="p-5 sm:p-6 md:flex md:min-h-0 md:flex-1 md:flex-col">
                <div className="mb-3 rounded-2xl border border-sky-100 bg-slate-50/80 px-3 py-2 md:shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex min-h-9 items-center gap-2 rounded-full border border-sky-200 bg-white px-2.5 py-1.5 text-slate-600 shadow-sm">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-500">Court Count</span>
                        <span className="h-4 w-px bg-sky-100" aria-hidden="true" />
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label="Decrease court count"
                            onClick={() => onChangeCourtCount(queue.court_count - 1)}
                            disabled={isSavingCourtCount || queue.court_count <= 1}
                            className={courtCountButtonClass}
                          >
                            -
                          </button>
                          <span className="min-w-5 text-center text-lg font-black leading-none text-slate-900" aria-live="polite">
                            {queue.court_count}
                          </span>
                          <button
                            type="button"
                            aria-label="Increase court count"
                            onClick={() => onChangeCourtCount(queue.court_count + 1)}
                            disabled={isSavingCourtCount || queue.court_count >= 6}
                            className={courtCountButtonClass}
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="inline-flex items-center gap-2 px-1 py-1 text-sm font-medium text-slate-600">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                        <span>
                          0 of {queue.court_count} courts in use
                        </span>
                      </div>
                    </div>

                    {playersCollapsed && (
                      <button
                        type="button"
                        onClick={() => setPlayersCollapsed(false)}
                        className="inline-flex min-h-10 items-center rounded-full border border-sky-300 bg-white px-4 py-2 text-sm font-bold text-sky-700 shadow-sm transition-colors hover:border-sky-400 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 cursor-pointer"
                      >
                        Show players
                      </button>
                    )}
                  </div>
                </div>

                <div className="md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-1">
                  <CourtsGrid courts={courts} readOnly />
                </div>
              </div>
            </section>
          </section>

          {!playersCollapsed && (
            <aside
              aria-label="Players"
              className="order-2 space-y-3 md:sticky md:top-6 md:flex md:h-[calc(100vh-7rem)] md:flex-col md:gap-3 md:space-y-0 md:self-start md:overflow-hidden"
            >
              <div className="md:min-h-0 md:flex-1">
                <PlayerListPanel
                  {...playerHandlers}
                  headerActions={
                    <>
                      <SidebarButton label="Hide players" onClick={() => setPlayersCollapsed(true)}>
                        <svg className="h-6 w-6" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <rect x="3.25" y="4" width="13.5" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
                          <path d="M12.1 4v12" stroke="currentColor" strokeWidth="1.8" />
                          <path d="m8.6 7.2 2.6 2.8-2.6 2.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </SidebarButton>
                      <SidebarButton label="Expand players" onClick={() => setPlayersExpanded(true)}>
                        <svg className="h-6 w-6" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <rect x="4" y="4" width="12" height="12" rx="2.4" stroke="currentColor" strokeWidth="1.8" />
                          <path d="M8 12V8h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M12 8 8 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      </SidebarButton>
                    </>
                  }
                />
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
