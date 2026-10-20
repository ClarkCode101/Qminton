import { getStatusLabel, isPlayerLocked, SKILL_LABELS, type PlayerStatus, type PlayerStatusType } from "@/features/players/player-status";
import type { Player } from "@/services/players";

// Status chip colors (from the old QueueCard STATUS_CONFIG).
const STATUS_BADGES: Record<PlayerStatusType, string> = {
  queued: "bg-indigo-50 text-indigo-700",
  ready: "bg-emerald-50 text-emerald-700",
  playing: "bg-orange-50 text-orange-700",
  paused: "bg-rose-50 text-rose-700",
  resting: "bg-amber-50 text-amber-700",
};

// Expanded view columns: # | Player | Status | Skill | Games | Actions.
// Fixed widths (Actions fits Take Break + Move Later + Remove) so every row
// lines up. From 1024px wide; narrower screens put the actions under the name.
export const EXPANDED_ROW_GRID =
  "grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 lg:grid-cols-[2.5rem_minmax(0,1fr)_6.5rem_7rem_3.5rem_18rem]";

interface Props {
  player: Player;
  status: PlayerStatus;
  presentation: "sidebar" | "expanded";
  // Sidebar only: whether this row shows its actions.
  isOpen: boolean;
  onToggleOpen: () => void;
  onRemove: (player: Player) => void;
  onTogglePause: (player: Player) => void;
  onMoveToBottom: (player: Player) => void;
}

function gamesLabel(count: number) {
  return `${count} game${count === 1 ? "" : "s"}`;
}

// 36px tall so they are easy to tap on a tablet.
const actionButtonClass =
  "inline-flex min-h-9 items-center justify-center rounded-full px-3.5 text-xs font-semibold shadow-sm transition-colors cursor-pointer";

// Take Break / Mark Ready, Move Later and Remove (or why they are not available).
function PlayerActions({
  player,
  onTogglePause,
  onMoveToBottom,
  onRemove,
  afterAction,
  className = "",
}: {
  player: Player;
  onTogglePause: (player: Player) => void;
  onMoveToBottom: (player: Player) => void;
  onRemove: (player: Player) => void;
  afterAction?: () => void;
  className?: string;
}) {
  if (isPlayerLocked(player)) {
    return (
      <p className={`text-xs font-medium text-slate-500 ${className}`}>
        {player.is_playing ? "Currently on court." : "Locked into the next match."}
      </p>
    );
  }

  const run = (action: (player: Player) => void) => () => {
    afterAction?.();
    action(player);
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={run(onTogglePause)}
        title={player.is_paused ? "Resume player" : "Put on break"}
        className={`${actionButtonClass} ${
          player.is_paused
            ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "bg-slate-900 text-white hover:bg-slate-800"
        }`}
      >
        {player.is_paused ? "Mark Ready" : "Take Break"}
      </button>
      {!player.is_paused && (
        <button
          type="button"
          onClick={run(onMoveToBottom)}
          title="Move to bottom of queue"
          className={`${actionButtonClass} border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50`}
        >
          Move Later
        </button>
      )}
      {/* A word, not a red ×: so it can't be mistaken for "close". */}
      <button
        type="button"
        onClick={() => onRemove(player)}
        aria-label={`Remove ${player.name}`}
        className={`${actionButtonClass} border border-rose-200 bg-white text-rose-600 hover:bg-rose-50`}
      >
        Remove
      </button>
    </div>
  );
}

// One player: a compact row in the sidebar (tap it for the actions), or a
// table row in the expanded view (actions always visible). Ported from the old
// QueueCard; reworked in the UI review (2026-10-20) so more players fit and
// buttons are easy to hit on a tablet.
export function PlayerCard({ player, status, presentation, isOpen, onToggleOpen, onRemove, onTogglePause, onMoveToBottom }: Props) {
  const badgeClass = STATUS_BADGES[status.type];
  const statusLabel = getStatusLabel(status);
  const skillLabel = SKILL_LABELS[player.skill];
  const details = `${gamesLabel(player.games_played)} played • ${skillLabel} • ${statusLabel}`;
  const statusChip = (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeClass}`}>{statusLabel}</span>
  );

  if (presentation === "expanded") {
    return (
      <div className={`${EXPANDED_ROW_GRID} px-4 py-3`}>
        <span className="text-sm font-semibold tabular-nums text-slate-500">#{player.queue_position + 1}</span>
        <div className="min-w-0">
          <p title={details} className="truncate text-[15px] font-bold leading-tight text-slate-900">
            {player.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500 lg:hidden">
            {skillLabel} · {gamesLabel(player.games_played)}
          </p>
        </div>
        <span className="justify-self-end lg:justify-self-start">{statusChip}</span>
        <span className="hidden text-sm text-slate-700 lg:block">{skillLabel}</span>
        <span className="hidden text-sm tabular-nums text-slate-700 lg:block">{player.games_played}</span>
        <PlayerActions
          player={player}
          onTogglePause={onTogglePause}
          onMoveToBottom={onMoveToBottom}
          onRemove={onRemove}
          className="col-span-2 col-start-2 lg:col-span-1 lg:col-start-auto lg:justify-end lg:text-right"
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border bg-white transition-colors ${
        isOpen ? "border-sky-200 shadow-sm" : "border-slate-100 hover:border-slate-200"
      }`}
    >
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={isOpen}
        aria-label={`${isOpen ? "Hide" : "Show"} details for ${player.name}`}
        className="flex w-full items-center gap-2.5 rounded-xl py-2.5 pl-3 pr-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-300 cursor-pointer"
      >
        <span className="min-w-0 flex-1">
          <span title={details} className="block truncate text-[15px] font-bold leading-tight text-slate-900">
            {player.name}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {skillLabel} · {gamesLabel(player.games_played)}
          </span>
        </span>
        {statusChip}
        {/* Arrow = "tap for more"; it turns up while the actions are showing. */}
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <div className="border-t border-slate-100 px-3 py-2.5">
          <PlayerActions
            player={player}
            onTogglePause={onTogglePause}
            onMoveToBottom={onMoveToBottom}
            onRemove={onRemove}
            afterAction={onToggleOpen}
          />
        </div>
      )}
    </div>
  );
}
