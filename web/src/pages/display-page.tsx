import { useEffect, useState } from "react";
import { useParams } from "react-router";

import { FullScreenMessage } from "@/components/full-screen-message";
import { LoadError } from "@/components/load-error";
import { DisplayCourt } from "@/features/display/display-court";
import { buildDisplayCourts, useDisplay } from "@/features/display/use-display";
import { formatTeamLabel } from "@/features/matchmaking/match-view";
import { gameModeLabel } from "@/lib/format";

// Public display (ported from the old app/queue/display/page.tsx). Anyone with
// the link can watch; no login. Updates live (Realtime) instead of every 10 s.
// Redesigned for a TV across the hall (owner, 2026-10-21): one thin header
// (name, Live, clock, Full screen), the courts fill the screen with big names
// and timers, Up Next is a strip at the bottom. No "Organizer View" button:
// players look at this screen; the organizer has their own. The QR to follow on
// a phone is in the organizer's More menu ("Show QR code"), not here.
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
  const moreWaiting = display.queuedCount - display.upNext.length;

  return (
    // Fills the screen without scrolling from laptop size up (a TV); phones scroll.
    <div className="flex min-h-dvh flex-col gap-3 bg-[radial-gradient(circle_at_top,#dbeafe,#f8fafc_35%,#eef6ff)] p-3 text-slate-800 sm:gap-4 sm:p-5 lg:h-dvh">
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-black tracking-tight text-slate-900 sm:text-4xl">{display.name}</h1>
          <p className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-slate-500 sm:text-base">
            <span className="inline-flex items-center gap-1.5 text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              Live
            </span>
            <span aria-hidden="true">·</span>
            {gameModeLabel(display.gameMode)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Clock />
          <FullScreenButton />
        </div>
      </header>

      <main className={`grid min-h-0 gap-3 sm:gap-4 lg:flex-1 ${courtGridClass(courts.length)}`}>
        {courts.map((court) => (
          <DisplayCourt key={court.courtNo} court={court} />
        ))}
      </main>

      <section
        aria-label="Up Next"
        className="flex flex-col gap-2 rounded-2xl border border-sky-200 bg-white/92 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:gap-5 sm:px-5"
      >
        <h2 className="shrink-0 text-sm font-black uppercase tracking-[0.14em] text-indigo-500 sm:text-base">Up next</h2>
        {display.upNext.length === 0 ? (
          <p className="text-base text-slate-500 sm:text-lg">No matches waiting</p>
        ) : (
          <ol className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:gap-3">
            {display.upNext.map((match) => (
              <li
                key={match.position}
                className="flex min-w-0 flex-1 items-baseline gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2"
              >
                <span className="shrink-0 text-sm font-black text-indigo-500 sm:text-base">{match.position}</span>
                <span className="min-w-0 truncate text-base font-bold text-slate-800 sm:text-lg xl:text-xl">
                  <span>{formatTeamLabel(match.team1, display.gameMode)}</span>
                  <span className="px-1.5 text-sm font-medium text-slate-400">vs</span>
                  <span>{formatTeamLabel(match.team2, display.gameMode)}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        {moreWaiting > 0 && <p className="shrink-0 text-sm font-semibold text-slate-500 sm:text-base">+{moreWaiting} more</p>}
      </section>
    </div>
  );
}

// Courts per row by how many there are, so they use the whole screen:
// 1 | 2 side by side | 3–4 = 2×2 (bigger names than 3 in a row) | 5–6 = 3×2.
// Phones: one per row, packed at the top.
function courtGridClass(count: number): string {
  const base = "grid-cols-1 content-start sm:grid-cols-2 lg:content-stretch";
  if (count <= 1) return "grid-cols-1 content-start lg:content-stretch lg:grid-rows-1";
  if (count === 2) return `${base} lg:grid-rows-1`;
  if (count <= 4) return `${base} lg:grid-rows-2`;
  return `${base} lg:grid-cols-3 lg:grid-rows-2`;
}

// "7:42 PM", updated every 10 seconds.
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);
  return (
    <p className="text-xl font-black tabular-nums text-slate-700 sm:text-3xl">
      {now.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}
    </p>
  );
}

// For a TV: hides the browser bars. Gone while in full screen (Esc leaves) and
// on browsers that can't do it (e.g. iPhone Safari).
function FullScreenButton() {
  const [isFullScreen, setIsFullScreen] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const onChange = () => setIsFullScreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  if (isFullScreen || !document.fullscreenEnabled) return null;
  return (
    <button
      type="button"
      onClick={() => void document.documentElement.requestFullscreen().catch(() => {})}
      className="hidden min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer sm:inline-flex"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9V5.25A1.5 1.5 0 0 1 5.25 3.75H9m6 0h3.75a1.5 1.5 0 0 1 1.5 1.5V9m0 6v3.75a1.5 1.5 0 0 1-1.5 1.5H15m-6 0H5.25a1.5 1.5 0 0 1-1.5-1.5V15" />
      </svg>
      Full screen
    </button>
  );
}
