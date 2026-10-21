import { CourtsGrid } from "@/features/courts/courts-grid";
import { buildDisplayCourts, useDisplayQuery } from "@/features/display/use-display";
import type { DisplayPlayer } from "@/services/display";
import type { GameMode } from "@/services/queues";

// The public display, made small for a phone: who is on each court and the
// next matches. The join page's "View courts", so one QR does both (owner's
// request, 2026-10-21). `highlight` = names joined from this phone, in bold.
// No link to the full display: it has an "Organizer View" button (owner).
export function LiveCourts({ queueId, highlight = [] }: { queueId: string; highlight?: string[] }) {
  const displayQuery = useDisplayQuery(queueId);
  const display = displayQuery.data;
  if (displayQuery.isError) {
    return (
      <p className="mt-4 text-sm text-slate-500">
        Could not load the courts.{" "}
        <button type="button" onClick={() => void displayQuery.refetch()} className="font-semibold text-blue-600 hover:underline cursor-pointer">
          Try again
        </button>
      </p>
    );
  }
  if (!display) return <p className="mt-4 text-sm text-slate-500">Loading...</p>;

  const mine = new Set(highlight.map((name) => name.toLowerCase()));
  const moreWaiting = display.queuedCount - display.upNext.length;

  return (
    <section aria-label="Courts" className="mt-1">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-black tracking-tight text-slate-900">On the courts</h1>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          Live
        </span>
      </div>

      {/* The same court cards as the display (owner: show the court itself). */}
      <div className="mt-4">
        <CourtsGrid courts={buildDisplayCourts(display)} readOnly highlight={mine} />
      </div>

      <h3 className="mt-5 text-sm font-bold text-slate-900">Up next</h3>
      {display.upNext.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">No matches waiting.</p>
      ) : (
        // Same columns as the court cards above (1 / 2 / 3 per row), like Up Next on the Courts tab.
        <div className="@container mt-2">
          <ol className="grid grid-cols-1 gap-2 @lg:grid-cols-2 @3xl:grid-cols-3">
            {display.upNext.map((match) => (
              <li key={match.position} className="flex gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5">
                <span className="w-6 shrink-0 pt-0.5 text-xs font-semibold text-indigo-500">#{match.position}</span>
                <Match team1={match.team1} team2={match.team2} mode={display.gameMode} mine={mine} />
              </li>
            ))}
          </ol>
        </div>
      )}
      {moreWaiting > 0 && <p className="mt-1 text-xs text-slate-500">+{moreWaiting} more waiting</p>}
    </section>
  );
}

function Match({
  team1,
  team2,
  mode,
  mine,
}: {
  team1: DisplayPlayer[];
  team2: DisplayPlayer[];
  mode: GameMode;
  mine: Set<string>;
}) {
  return (
    <div className="min-w-0 text-sm leading-5 text-slate-700">
      <Team players={team1} mode={mode} mine={mine} />
      <span className="text-xs text-slate-400"> vs </span>
      <Team players={team2} mode={mode} mine={mine} />
    </div>
  );
}

function Team({ players, mode, mine }: { players: DisplayPlayer[]; mode: GameMode; mine: Set<string> }) {
  return (
    <>
      {players.map((player, index) => (
        <span key={player.id}>
          {index > 0 && (mode === "singles" ? "" : " + ")}
          <span className={mine.has(player.name.toLowerCase()) ? "font-bold text-blue-700" : undefined}>{player.name}</span>
        </span>
      ))}
    </>
  );
}
