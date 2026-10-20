import { OverlayPanel } from "@/components/overlay-panel";
import { formatTeamLabel, teamPlayers } from "@/features/matchmaking/match-view";
import type { MatchWithPlayers } from "@/services/matches";
import type { GameMode } from "@/services/queues";

function waitingLabel(count: number) {
  return count === 1 ? "1 match waiting" : `${count} matches waiting`;
}

function MatchLine({ match, mode }: { match: MatchWithPlayers; mode: GameMode }) {
  return (
    <p className="mt-3 text-lg font-black leading-tight text-slate-900">
      <span>{formatTeamLabel(teamPlayers(match, 1), mode)}</span>
      <span className="mx-2 align-middle text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">vs</span>
      <span>{formatTeamLabel(teamPlayers(match, 2), mode)}</span>
    </p>
  );
}

// "Up Next" under the courts: the first 3 queued matches + "View all"
// (ported from the old QueueCourtsTab).
export function UpNextSection({
  matches,
  mode,
  onViewAll,
}: {
  matches: MatchWithPlayers[];
  mode: GameMode;
  onViewAll: () => void;
}) {
  if (matches.length === 0) return null;
  const visible = matches.slice(0, 3);

  return (
    <section aria-label="Up Next" className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-600">Up Next</p>
          <span className="text-xs font-semibold text-indigo-600">{waitingLabel(matches.length)}</span>
        </div>
        {/* Old app showed this only with 4+ matches, so 1–3 queued matches
            could never be removed. Now it's always there. */}
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex items-center rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 cursor-pointer"
        >
          View all
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {visible.map((match) => (
          <div key={match.id} className="rounded-[28px] border border-indigo-100 bg-white px-4 py-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">Match {match.queue_order}</p>
            <MatchLine match={match} mode={mode} />
          </div>
        ))}
      </div>
    </section>
  );
}

// "View all" overlay, where queued matches can be removed.
export function UpNextOverlay({
  matches,
  mode,
  onRemove,
  onClose,
}: {
  matches: MatchWithPlayers[];
  mode: GameMode;
  onRemove: (match: MatchWithPlayers) => void;
  onClose: () => void;
}) {
  const description =
    matches.length === 1
      ? "1 match is waiting for the next open court."
      : `${matches.length} matches are waiting for the next open court.`;

  return (
    <OverlayPanel eyebrow="Up Next" title="Matches waiting" description={description} tone="indigo" onClose={onClose}>
      {matches.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-10 text-center text-sm text-slate-500">
          No matches waiting.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {matches.map((match) => (
            <div key={match.id} className="rounded-[28px] border border-indigo-100 bg-indigo-50/35 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">Match {match.queue_order}</p>
                <button
                  type="button"
                  onClick={() => onRemove(match)}
                  aria-label={`Remove queued match ${match.queue_order}`}
                  className="inline-flex shrink-0 items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-rose-200 hover:text-rose-500 cursor-pointer"
                >
                  Remove
                </button>
              </div>
              <MatchLine match={match} mode={mode} />
            </div>
          ))}
        </div>
      )}
    </OverlayPanel>
  );
}
