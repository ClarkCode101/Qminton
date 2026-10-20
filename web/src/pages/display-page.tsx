import { Link, useParams } from "react-router";

import { FullScreenMessage } from "@/components/full-screen-message";
import { LoadError } from "@/components/load-error";
import { CourtsGrid } from "@/features/courts/courts-grid";
import { DisplayQrCode } from "@/features/display/display-qr";
import { buildDisplayCourts, useDisplay } from "@/features/display/use-display";
import { formatTeamLabel } from "@/features/matchmaking/match-view";
import { gameModeLabel } from "@/lib/format";
import { getQueuePath } from "@/lib/routes";

// Public display (ported from the old app/queue/display/page.tsx). Anyone with
// the link can watch; no login. Updates live (Realtime) instead of every 10 s.
// New (owner's addition): a small QR code so people can open it on their phone.
export function DisplayPage() {
  const { queueId = "" } = useParams();
  const displayQuery = useDisplay(queueId);

  if (displayQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#e0f2fe,#f8fafc_40%,#f8fafc)]">
        <p className="text-sm text-slate-500">Loading display...</p>
      </div>
    );
  }

  // Old bug #4: any hiccup sent the TV screen to "/". Now it stays with a retry.
  if (displayQuery.isError) {
    return (
      <LoadError
        message="Could not load the display. Check your connection and try again."
        onRetry={() => void displayQuery.refetch()}
      />
    );
  }

  const display = displayQuery.data;
  if (!display) {
    return <FullScreenMessage title="Queue not found" message="This display link is no longer active." />;
  }

  const courts = buildDisplayCourts(display);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#dbeafe,#f8fafc_35%,#eef6ff)] text-slate-800">
      <div className="mx-auto max-w-384 px-4 py-4 sm:px-5 sm:py-5">
        <div className="mb-4 flex flex-col gap-3 sm:mb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-500">Live Player Display</p>
            <h1 className="mt-1 text-3xl font-black text-slate-900 md:text-4xl">{display.name}</h1>
            <p className="mt-1 text-sm text-slate-500 md:text-base">{gameModeLabel(display.gameMode)} session</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              <span className="rounded-full border border-sky-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
                On court {display.courts.length}
              </span>
              <span className="rounded-full border border-sky-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
                Coming up {display.queuedCount}
              </span>
              <Link
                to={getQueuePath(queueId)}
                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-slate-800"
              >
                Organizer View
              </Link>
            </div>
            {/* Hidden on phones: someone already on their phone doesn't need to scan. */}
            <div className="hidden items-center gap-2.5 rounded-2xl border border-sky-200 bg-white/90 p-2 pr-3 shadow-sm sm:flex">
              <DisplayQrCode queueId={queueId} size={84} />
              <p className="max-w-24 text-xs font-medium leading-4 text-slate-600">Scan to follow on your phone</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-3 px-1">
              <h2 className="text-lg font-semibold text-slate-800">Courts</h2>
              <p className="mt-0.5 text-sm text-slate-500">Who is playing right now.</p>
            </div>
            <CourtsGrid courts={courts} readOnly compact />
          </div>

          <section aria-label="Up Next" className="rounded-[28px] border border-sky-200 bg-white/92 p-4 shadow-sm backdrop-blur-sm sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Up Next</h2>
                <p className="mt-0.5 text-xs text-slate-500">The next matches waiting for a court.</p>
              </div>
              <span className="text-xs font-medium text-slate-500">{display.queuedCount} queued</span>
            </div>

            {display.upNext.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/50 px-4 py-4 text-center text-sm text-slate-500">
                No upcoming matches yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {display.upNext.map((match) => (
                  <div key={match.position} className="rounded-2xl border border-indigo-100 bg-indigo-50/50 px-3 py-3">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Match {match.position}</p>
                    <p className="text-base font-bold leading-tight text-slate-800">{formatTeamLabel(match.team1, display.gameMode)}</p>
                    <p className="my-1 text-xs text-slate-500">vs</p>
                    <p className="text-base font-bold leading-tight text-slate-800">{formatTeamLabel(match.team2, display.gameMode)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
