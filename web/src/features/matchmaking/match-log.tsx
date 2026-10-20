import { formatTeamLabel, teamPlayers } from "@/features/matchmaking/match-view";
import type { MatchWithPlayers } from "@/services/matches";
import type { GameMode } from "@/services/queues";
import type { Enums } from "@/types/database";

type MatchStatus = Enums<"match_status">;

// Same labels and colors as the old MatchHistoryPanel.
const STATUS: Record<MatchStatus, { label: string; className: string }> = {
  completed: { label: "Finished", className: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  started: { label: "On Court", className: "bg-blue-50 text-blue-700 border-blue-100" },
  queued: { label: "Up Next", className: "bg-indigo-50 text-indigo-700 border-indigo-100" },
  cancelled: { label: "Cancelled", className: "bg-rose-50 text-rose-700 border-rose-100" },
};

// Finished time, else start time, else when it was created (old formatWhen).
function formatWhen(match: MatchWithPlayers): string {
  const timestamp = match.completed_at ?? match.started_at ?? match.created_at;
  return new Date(timestamp).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

// Old app: court name, or "Coming up #N" for a match that never got a court.
function placeLabel(match: MatchWithPlayers): string {
  return match.court_no !== null ? `Court ${match.court_no}` : `Coming up #${match.queue_length || 1}`;
}

export function MatchLogList({ matches, mode }: { matches: MatchWithPlayers[]; mode: GameMode }) {
  if (matches.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/40 px-4 py-10 text-center text-sm text-slate-500">
        No recent results yet.
      </div>
    );
  }

  return (
    <ol className="space-y-2" aria-label="Recent results">
      {matches.map((match) => {
        const status = STATUS[match.status];
        return (
          <li key={match.id} className="rounded-xl border border-sky-100 bg-slate-50/70 px-4 py-3">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-medium ${status.className}`}>
                {status.label}
              </span>
              <span className="text-xs text-slate-500">{placeLabel(match)}</span>
              <span className="text-xs text-slate-500">{formatWhen(match)}</span>
            </div>
            <p className="text-sm font-semibold text-slate-700">
              {formatTeamLabel(teamPlayers(match, 1), mode)} vs {formatTeamLabel(teamPlayers(match, 2), mode)}
            </p>
            {match.cancel_reason && <p className="mt-1 text-xs text-rose-600">{match.cancel_reason}</p>}
          </li>
        );
      })}
    </ol>
  );
}
