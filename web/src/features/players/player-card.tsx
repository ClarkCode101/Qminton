import type { ReactNode } from "react";

import { getStatusLabel, isPlayerLocked, SKILL_LABELS, type PlayerStatus, type PlayerStatusType } from "@/features/players/player-status";
import type { Player } from "@/services/players";

// Colors per status (from the old QueueCard STATUS_CONFIG).
const STATUS_STYLES: Record<
  PlayerStatusType,
  { dot: string; badge: string; cardSurface: string; cardGlow: string }
> = {
  queued: {
    dot: "bg-indigo-500",
    badge: "bg-indigo-50 text-indigo-700",
    cardSurface: "border-indigo-100 bg-[linear-gradient(180deg,#ffffff_0%,#f6f7ff_100%)]",
    cardGlow: "bg-indigo-200/35",
  },
  ready: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700",
    cardSurface: "border-emerald-100 bg-[linear-gradient(180deg,#ffffff_0%,#f3fff8_100%)]",
    cardGlow: "bg-emerald-200/35",
  },
  playing: {
    dot: "bg-orange-500",
    badge: "bg-orange-50 text-orange-700",
    cardSurface: "border-orange-100 bg-[linear-gradient(180deg,#ffffff_0%,#fff7f1_100%)]",
    cardGlow: "bg-orange-200/35",
  },
  paused: {
    dot: "bg-rose-500",
    badge: "bg-rose-50 text-rose-700",
    cardSurface: "border-rose-100 bg-[linear-gradient(180deg,#ffffff_0%,#fff4f6_100%)]",
    cardGlow: "bg-rose-200/35",
  },
  resting: {
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700",
    cardSurface: "border-amber-100 bg-[linear-gradient(180deg,#ffffff_0%,#fffaf0_100%)]",
    cardGlow: "bg-amber-200/40",
  },
};

interface Props {
  player: Player;
  status: PlayerStatus;
  presentation: "sidebar" | "expanded";
  isFlipped: boolean;
  onToggleFlip: () => void;
  onRemove: (player: Player) => void;
  onTogglePause: (player: Player) => void;
  onMoveToBottom: (player: Player) => void;
}

function gamesLabel(count: number) {
  return `${count} game${count === 1 ? "" : "s"}`;
}

const removeButtonClass = (expanded: boolean) =>
  `inline-flex ${expanded ? "h-8 w-8 text-lg" : "h-7 w-7 text-base"} shrink-0 items-center justify-center rounded-full border border-rose-100 bg-white/90 leading-none text-rose-500 shadow-sm transition-colors hover:bg-rose-50 hover:text-rose-600 cursor-pointer`;

const actionButtonClass = (expanded: boolean) =>
  `inline-flex ${expanded ? "min-h-9 px-3.5 text-xs" : "min-h-8 px-3 text-[11px]"} items-center justify-center rounded-full font-semibold shadow-sm transition-colors cursor-pointer`;

function PlayerActions({
  player,
  expanded,
  onTogglePause,
  onMoveToBottom,
  afterAction,
}: {
  player: Player;
  expanded: boolean;
  onTogglePause: (player: Player) => void;
  onMoveToBottom: (player: Player) => void;
  afterAction?: () => void;
}) {
  if (isPlayerLocked(player)) {
    return (
      <div
        className={`mt-auto border border-slate-100 bg-slate-50/80 font-medium text-slate-500 ${
          expanded ? "rounded-xl px-3 py-2.5 text-[11px]" : "rounded-lg px-2.5 py-2 text-[10px]"
        }`}
      >
        {player.is_playing ? "Currently on court." : "Locked into the next match."}
      </div>
    );
  }

  return (
    <div className={`mt-auto grid ${expanded ? "gap-2" : "gap-1.5"} ${player.is_paused ? "grid-cols-1" : "grid-cols-2"}`}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          afterAction?.();
          onTogglePause(player);
        }}
        title={player.is_paused ? "Resume player" : "Put on break"}
        className={`${actionButtonClass(expanded)} ${
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
          onClick={(event) => {
            event.stopPropagation();
            afterAction?.();
            onMoveToBottom(player);
          }}
          title="Move to bottom of queue"
          className={`border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 ${actionButtonClass(expanded)}`}
        >
          Move Later
        </button>
      )}
    </div>
  );
}

// One player in the sidebar (tap to flip for details and actions) or in the
// expanded overlay (everything visible at once). Ported from the old QueueCard.
export function PlayerCard({ player, status, presentation, isFlipped, onToggleFlip, onRemove, onTogglePause, onMoveToBottom }: Props) {
  const style = STATUS_STYLES[status.type];
  const statusLabel = getStatusLabel(status);
  const skillLabel = SKILL_LABELS[player.skill];
  const queueSpot = `#${player.queue_position + 1}`;
  const details = `${gamesLabel(player.games_played)} played • ${skillLabel} • ${statusLabel}`;
  const canEdit = !isPlayerLocked(player);

  const removeButton = canEdit && (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onRemove(player);
      }}
      title="Remove player"
      aria-label={`Remove ${player.name}`}
      className={removeButtonClass(presentation === "expanded")}
    >
      ×
    </button>
  );

  if (presentation === "expanded") {
    const infoCell = (label: string, value: ReactNode) => (
      <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <div className="mt-1.5 truncate text-xs font-semibold text-slate-700">{value}</div>
      </div>
    );

    return (
      <article className={`relative overflow-hidden rounded-3xl border p-4 shadow-sm shadow-slate-100/70 ${style.cardSurface}`}>
        <div className={`absolute -right-5 -top-7 h-16 w-16 rounded-full blur-2xl ${style.cardGlow}`} />
        <div className="relative flex h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm ${style.badge}`}>{statusLabel}</span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm ${style.badge}`}>
                  Queue {queueSpot}
                </span>
              </div>
              <h3 title={details} className="mt-3 truncate text-[1.7rem] font-black leading-[0.94] tracking-tighter text-slate-900">
                {player.name}
              </h3>
            </div>
            {removeButton}
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-100 bg-white/85 p-3">
            {infoCell(
              "Status",
              <span className="inline-flex max-w-full items-center gap-1.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                <span className="truncate">{statusLabel}</span>
              </span>,
            )}
            {infoCell("Skill", skillLabel)}
            {infoCell("Games", gamesLabel(player.games_played))}
            {infoCell("Queue Spot", queueSpot)}
          </div>

          <PlayerActions player={player} expanded onTogglePause={onTogglePause} onMoveToBottom={onMoveToBottom} />
        </div>
      </article>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isFlipped}
      aria-label={`${isFlipped ? "Hide" : "Show"} details for ${player.name}`}
      onClick={onToggleFlip}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggleFlip();
        }
        if (event.key === "Escape" && isFlipped) {
          event.preventDefault();
          onToggleFlip();
        }
      }}
      className="cursor-pointer rounded-xl outline-none perspective-distant focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2"
    >
      <div
        className={`relative rounded-xl transform-3d transition-[height,transform] duration-500 ${isFlipped ? "h-38" : "h-29.5"} ${
          isFlipped ? "transform-[rotateY(180deg)]" : ""
        }`}
      >
        {/* Front: name + status */}
        <div className={`absolute inset-0 overflow-hidden rounded-xl border px-3.5 py-3 shadow-sm shadow-slate-100/70 backface-hidden ${style.cardSurface}`}>
          <div className={`absolute -right-5 -top-7 h-16 w-16 rounded-full blur-2xl ${style.cardGlow}`} />
          <div className="relative h-full">
            <div className="absolute right-0 top-0">
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm ${style.badge}`}>{statusLabel}</span>
            </div>
            <div className="flex h-full items-center justify-center px-2 text-center">
              <p title={details} className="max-w-full wrap-break-word text-[1.34rem] font-black leading-[0.92] tracking-tighter text-slate-900 sm:text-[1.46rem]">
                {player.name}
              </p>
            </div>
          </div>
        </div>

        {/* Back: details + actions */}
        <div className="absolute inset-0 overflow-hidden rounded-xl border border-slate-100 bg-white px-3 py-3 shadow-sm shadow-slate-100/70 backface-hidden transform-[rotateY(180deg)]">
          <div className={`absolute -left-5 -top-6 h-14 w-14 rounded-full blur-2xl ${style.cardGlow}`} />
          <div className="relative flex h-full flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 truncate pr-2 text-sm font-black leading-tight text-slate-900">{player.name}</p>
              {removeButton}
            </div>

            <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status</p>
                <div className="mt-1 inline-flex max-w-full items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                  <span className="truncate">{statusLabel}</span>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">Skill</p>
                <p className="mt-1 truncate text-[11px] font-semibold text-slate-700">{skillLabel}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">Games</p>
                <p className="mt-1 truncate text-[11px] font-semibold text-slate-700">{gamesLabel(player.games_played)}</p>
              </div>
            </div>

            <PlayerActions
              player={player}
              expanded={false}
              onTogglePause={onTogglePause}
              onMoveToBottom={onMoveToBottom}
              afterAction={onToggleFlip}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
