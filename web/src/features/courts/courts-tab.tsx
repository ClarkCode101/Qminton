import { useEffect, useState } from "react";

import { CloseButton } from "@/components/close-button";
import { MoreMenu } from "@/components/more-menu";
import { OverlayPanel } from "@/components/overlay-panel";
import { CourtsGrid } from "@/features/courts/courts-grid";
import { MatchLogList } from "@/features/matchmaking/match-log";
import { buildCourtViews, getMatchActionState, getQueuedMatches } from "@/features/matchmaking/match-view";
import { UpNextOverlay, UpNextSection } from "@/features/matchmaking/up-next";
import { PlayerListPanel } from "@/features/players/player-list-panel";
import { formatCurrency } from "@/lib/format";
import type { MatchWithPlayers } from "@/services/matches";
import type { Player } from "@/services/players";
import type { Queue } from "@/services/queues";

interface Props {
  queue: Queue;
  players: Player[];
  // Matches on a court now + matches in Up Next.
  matches: MatchWithPlayers[];
  // Newest Match Log entries and how many there are in total.
  matchLog: { entries: MatchWithPlayers[]; total: number };
  isSavingCourtCount: boolean;
  isStartingMatch: boolean;
  isResetting: boolean;
  onStartMatch: () => void;
  onFinishCourt: (courtNo: number) => void;
  onShowResetMatchmaking: () => void;
  onCancelQueuedMatch: (match: MatchWithPlayers) => void;
  onChangeCourtCount: (courtCount: number) => void;
  onShowAddPlayer: () => void;
  onRemovePlayer: (player: Player) => void;
  onTogglePause: (player: Player) => void;
  onMoveToBottom: (player: Player) => void;
}

// "Expand" / "Hide" next to Add Player: words instead of look-alike icons, and
// as tall as Add Player (40px) so they are easy to hit on a tablet.
const viewActionClass =
  "inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 cursor-pointer md:flex-none";

function RateChip({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-slate-700 sm:gap-2 sm:px-3 ${
        muted ? "border-slate-200 bg-white shadow-sm" : "border-sky-100 bg-sky-50/70"
      }`}
    >
      <span className={`text-[11px] font-semibold uppercase tracking-[0.06em] sm:tracking-[0.14em] ${muted ? "text-slate-500" : "text-sky-700"}`}>{label}</span>
      <span className={`h-3.5 w-px ${muted ? "bg-slate-200" : "bg-sky-100"}`} aria-hidden="true" />
      <span className="font-semibold text-slate-900">{value}</span>
    </span>
  );
}

const courtCountButtonClass =
  "inline-flex h-7 w-7 items-center justify-center rounded-full text-base font-black leading-none text-slate-700 transition-colors hover:bg-sky-50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40";

type Overlay = "up-next" | "courts" | "match-log" | null;

// The Courts tab (ported from the old QueueCourtsTab).
export function CourtsTab({
  queue,
  players,
  matches,
  matchLog,
  isSavingCourtCount,
  isStartingMatch,
  isResetting,
  onStartMatch,
  onFinishCourt,
  onShowResetMatchmaking,
  onCancelQueuedMatch,
  onChangeCourtCount,
  onShowAddPlayer,
  onRemovePlayer,
  onTogglePause,
  onMoveToBottom,
}: Props) {
  const [playersCollapsed, setPlayersCollapsed] = useState(false);
  const [playersExpanded, setPlayersExpanded] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);

  const courts = buildCourtViews(queue.court_count, matches);
  const queuedMatches = getQueuedMatches(matches);
  const activeCourts = courts.filter((court) => court.status === "occupied").length;
  const matchAction = getMatchActionState(players, queue.game_mode, courts.length - activeCourts, queuedMatches.length);

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
      {overlay === "up-next" && (
        <UpNextOverlay
          matches={queuedMatches}
          mode={queue.game_mode}
          onRemove={onCancelQueuedMatch}
          onClose={() => setOverlay(null)}
        />
      )}

      {overlay === "match-log" && (
        <OverlayPanel eyebrow="Match Log" title="Recent results" maxWidthClassName="max-w-3xl" onClose={() => setOverlay(null)}>
          <MatchLogList matches={matchLog.entries} mode={queue.game_mode} />
        </OverlayPanel>
      )}

      {overlay === "courts" && (
        <OverlayPanel
          eyebrow="Live Courts"
          title={queue.name}
          description="Expanded view for all active courts."
          maxWidthClassName="max-w-6xl"
          onClose={() => setOverlay(null)}
        >
          <CourtsGrid courts={courts} onFinish={onFinishCourt} />
        </OverlayPanel>
      )}

      {playersExpanded && (
        <div className="fixed inset-0 z-50 flex justify-center bg-slate-950/35 p-3 backdrop-blur-sm sm:p-4" onClick={() => setPlayersExpanded(false)}>
          <div className="h-full w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <PlayerListPanel
              {...playerHandlers}
              presentation="expanded"
              headerActions={
                // Same ✕ as the other overlays; no hover label (it was cut off at the panel's edge).
                <CloseButton label="Close expanded players" onClick={() => setPlayersExpanded(false)} />
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
                      <h1 className="min-w-0 break-words text-xl font-black tracking-tight text-slate-900 sm:text-[1.55rem]">{queue.name}</h1>
                      <div className="flex flex-wrap items-center gap-1.5 text-[13px] sm:gap-2 sm:text-sm">
                        <RateChip label="Shuttle/Game" value={formatCurrency(queue.game_rate)} />
                        <RateChip label="Court Fee" value={formatCurrency(queue.court_fee)} muted />
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full gap-2 md:w-auto md:justify-end">
                    <button
                      type="button"
                      onClick={onStartMatch}
                      disabled={matchAction.disabled || isStartingMatch}
                      className={`inline-flex min-h-10 flex-1 items-center justify-center rounded-xl px-4.5 text-sm font-semibold transition-colors md:min-w-40 md:flex-none ${
                        matchAction.disabled
                          ? // Can not start yet: neutral and readable, the label says why.
                            "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-500"
                          : "bg-blue-600 text-white shadow-sm hover:bg-blue-700 cursor-pointer disabled:cursor-wait disabled:opacity-70"
                      }`}
                    >
                      {isStartingMatch ? "Picking teams..." : matchAction.label}
                    </button>
                    <button
                      type="button"
                      onClick={onShowAddPlayer}
                      className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer md:hidden"
                    >
                      Add Player
                    </button>
                  </div>
                </div>

                {matchAction.blockedByRest && <p className="mt-1.5 text-sm text-slate-500">{matchAction.hint}</p>}
              </div>

              <div className="p-3 sm:p-5 md:flex md:min-h-0 md:flex-1 md:flex-col">
                <div className="mb-3 rounded-2xl border border-sky-100 bg-slate-50/80 px-3 py-2 md:shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
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
                      <div className="inline-flex items-center gap-2 px-1 text-sm font-medium text-slate-600">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                        <span>
                          {activeCourts} of {courts.length} courts in use
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOverlay("courts")}
                        className="inline-flex min-h-8 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
                      >
                        View all courts
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {playersCollapsed && (
                        // Same pill as Match Log, with the count of players hidden away.
                        <button
                          type="button"
                          onClick={() => setPlayersCollapsed(false)}
                          className="inline-flex min-h-8 items-center justify-center rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-50 cursor-pointer"
                        >
                          Players ({players.length})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setOverlay("match-log")}
                        className="inline-flex min-h-8 items-center justify-center rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-50 cursor-pointer"
                      >
                        Match Log {matchLog.total > 0 ? `(${matchLog.total})` : ""}
                      </button>
                      {/* Reset clears every court and Up Next: kept away from a stray tap. */}
                      <MoreMenu
                        label="More court actions"
                        items={[
                          {
                            label: isResetting ? "Resetting..." : "Reset Matchmaking",
                            tone: "danger",
                            disabled: isResetting,
                            onSelect: onShowResetMatchmaking,
                          },
                        ]}
                      />
                    </div>
                  </div>
                </div>

                {/* Up Next always sits under the courts (owner's choice: a side column
                    next to the courts was tried and looked worse with 4+ courts). */}
                <div className="grid content-start gap-3 md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-1">
                  <CourtsGrid courts={courts} onFinish={onFinishCourt} />
                  <UpNextSection matches={queuedMatches} mode={queue.game_mode} onViewAll={() => setOverlay("up-next")} />
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
                  viewActions={
                    <>
                      <button type="button" onClick={() => setPlayersExpanded(true)} aria-label="Expand players" className={viewActionClass}>
                        Expand
                      </button>
                      <button type="button" onClick={() => setPlayersCollapsed(true)} aria-label="Hide players" className={viewActionClass}>
                        Hide
                      </button>
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
