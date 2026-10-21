import { Link } from "react-router";

import { useDisplayQuery } from "@/features/display/use-display";
import { getQueueDisplayPath } from "@/lib/routes";
import type { DisplayPlayer } from "@/services/display";
import type { GameMode } from "@/services/queues";

// The public display, made small for a phone: who is on each court and the
// next matches. Shown on the join page so one QR does both (owner's request,
// 2026-10-21). `highlight` = names joined from this phone, shown in bold.
export function LiveCourts({ queueId, highlight = [] }: { queueId: string; highlight?: string[] }) {
  const displayQuery = useDisplayQuery(queueId);
  const display = displayQuery.data;
  if (!display) return null;

  const mine = new Set(highlight.map((name) => name.toLowerCase()));
  const playing = new Map(display.courts.map((court) => [court.courtNo, court]));
  const courtNumbers = Array.from({ length: display.courtCount }, (_, index) => index + 1);
  const moreWaiting = display.queuedCount - display.upNext.length;

  return (
    <section aria-label="Courts" className="rounded-[28px] border border-sky-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">On the courts</h2>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          Live
        </span>
      </div>

      <ul className="mt-3 divide-y divide-slate-100">
        {courtNumbers.map((courtNo) => {
          const court = playing.get(courtNo);
          return (
            <li key={courtNo} className="flex gap-3 py-2.5">
              <span className="w-16 shrink-0 pt-0.5 text-xs font-semibold text-slate-500">Court {courtNo}</span>
              {court ? (
                <Match team1={court.team1} team2={court.team2} mode={display.gameMode} mine={mine} />
              ) : (
                <span className="text-sm text-slate-400">Free</span>
              )}
            </li>
          );
        })}
      </ul>

      <h3 className="mt-4 text-sm font-bold text-slate-900">Up next</h3>
      {display.upNext.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">No matches waiting.</p>
      ) : (
        <ol className="mt-1 divide-y divide-slate-100">
          {display.upNext.map((match) => (
            <li key={match.position} className="flex gap-3 py-2.5">
              <span className="w-16 shrink-0 pt-0.5 text-xs font-semibold text-indigo-500">#{match.position}</span>
              <Match team1={match.team1} team2={match.team2} mode={display.gameMode} mine={mine} />
            </li>
          ))}
        </ol>
      )}
      {moreWaiting > 0 && <p className="mt-1 text-xs text-slate-500">+{moreWaiting} more waiting</p>}

      <Link to={getQueueDisplayPath(queueId)} className="mt-4 inline-block text-xs font-semibold text-blue-600 hover:underline">
        Open full display
      </Link>
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
