import type { CourtView } from "@/features/courts/court-view";
import { useElapsedTime } from "@/features/courts/use-elapsed-time";

function CourtCard({
  court,
  onFinish,
  readOnly,
  compact,
  dense,
}: {
  court: CourtView;
  onFinish?: (courtNo: number) => void;
  readOnly: boolean;
  compact?: boolean;
  dense?: boolean;
}) {
  const isAvailable = court.status === "available";
  const elapsed = useElapsedTime(isAvailable ? null : court.startedAt);
  const tightCompact = compact && dense;
  const courtName = `Court ${court.courtNo}`;

  return (
    <div
      className={`border shadow-sm overflow-hidden flex flex-col ${compact ? "rounded-lg" : "rounded-xl"} ${
        isAvailable ? "border-slate-200 bg-white" : "border-amber-300 bg-white ring-2 ring-amber-200/60"
      }`}
    >
      {/* Card header */}
      <div
        className={`flex items-center justify-between ${tightCompact ? "px-2.5 py-1.5" : compact ? "px-3 py-2" : "px-4 py-2.5"} ${
          isAvailable ? "bg-slate-50" : "bg-amber-50"
        }`}
      >
        <span className={`${tightCompact ? "text-[11px]" : compact ? "text-xs" : "text-sm"} font-semibold text-slate-800`}>
          {courtName}
        </span>
        <span
          className={`flex items-center ${tightCompact ? "gap-1 px-1.5 py-0.5 text-[10px]" : compact ? "gap-1 px-2 py-0.5 text-[11px]" : "gap-1.5 px-2.5 py-0.5 text-xs"} rounded-full font-semibold ${
            isAvailable ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {!isAvailable && (
            <span className={`relative flex ${tightCompact || compact ? "h-1.5 w-1.5" : "h-2 w-2"}`}>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className={`relative inline-flex rounded-full ${tightCompact || compact ? "h-1.5 w-1.5" : "h-2 w-2"} bg-amber-500`} />
            </span>
          )}
          {isAvailable ? "Available" : "In Use"}
        </span>
      </div>

      {/* Badminton court diagram */}
      <div
        className="relative w-full"
        style={{
          background: isAvailable ? "#2d8a4e" : "#1a7a3a",
          aspectRatio: "13.4 / 6.1",
          maxHeight: tightCompact ? "90px" : compact ? "112px" : "124px",
        }}
      >
        <div className="absolute inset-1 border-2 border-white/90">
          <div className="absolute left-0 right-0 top-[7.5%] border-t border-white/70" />
          <div className="absolute left-0 right-0 bottom-[7.5%] border-b border-white/70" />
          <div className="absolute top-0 bottom-0 left-1/2 -translate-x-px border-l-2 border-dashed border-white/90" />
          <div className="absolute top-0 bottom-0 left-[35.2%] border-l border-white/70" />
          <div className="absolute top-0 bottom-0 right-[35.2%] border-r border-white/70" />
          <div className="absolute top-0 bottom-0 left-[5.7%] border-l border-white/70" />
          <div className="absolute top-0 bottom-0 right-[5.7%] border-r border-white/70" />
          <div className="absolute top-1/2 -translate-y-px left-[5.7%] border-t border-white/60" style={{ width: "29.5%" }} />
          <div className="absolute top-1/2 -translate-y-px right-[5.7%] border-t border-white/60" style={{ width: "29.5%" }} />
        </div>

        {!isAvailable && (
          <>
            {(
              [
                { label: "Team 1", side: "left-1/4", team: court.team1 },
                { label: "Team 2", side: "left-3/4", team: court.team2 },
              ] as const
            ).map(({ label, side, team }) => (
              // Centered in each half, on a dark backing so court lines never cross the names.
              <div
                key={label}
                className={`absolute ${side} top-1/2 z-10 flex max-w-[44%] -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-lg bg-slate-950/25 text-center ${
                  tightCompact ? "px-1.5 py-1" : "px-2.5 py-1.5"
                }`}
              >
                <span className={`${tightCompact ? "text-[10px]" : "text-[11px]"} mb-0.5 whitespace-nowrap font-bold uppercase leading-none tracking-[0.12em] text-white/85`}>
                  {label}
                </span>
                {team.map((player) => (
                  <span
                    key={player.id}
                    className={`${tightCompact ? "text-[13px]" : compact ? "text-sm" : "text-base"} max-w-full truncate font-black leading-tight text-white`}
                  >
                    {player.name}
                  </span>
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Card footer */}
      {!isAvailable ? (
        <div className={`${tightCompact ? "px-2.5 py-1.5" : compact ? "px-3 py-2" : "px-4 py-3"} flex items-center justify-between gap-3 border-t border-amber-100 bg-white`}>
          <div className="flex flex-col">
            <span className={`${tightCompact ? "text-[10px]" : "text-[11px]"} mb-0.5 leading-none text-slate-500`}>Playing for</span>
            <span className={`${tightCompact ? "text-[13px]" : compact ? "text-sm" : "text-base"} font-bold text-amber-600 tabular-nums leading-none`}>
              {elapsed || "—"}
            </span>
          </div>
          {!readOnly && onFinish && (
            <button
              type="button"
              onClick={() => onFinish(court.courtNo)}
              className={`${tightCompact ? "rounded-md px-3 py-1.5 text-xs" : "rounded-lg px-4 py-2 text-sm"} bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 cursor-pointer font-semibold text-white shadow-sm transition-colors`}
            >
              Finish Game
            </button>
          )}
        </div>
      ) : (
        <div className={`${tightCompact ? "px-2.5 py-1.5" : compact ? "px-3 py-2" : "px-4 py-3"} border-t border-slate-100 bg-white`}>
          <span className={`${tightCompact ? "text-[11px]" : "text-xs"} text-slate-500`}>Ready for next match</span>
        </div>
      )}
    </div>
  );
}

interface Props {
  courts: CourtView[];
  onFinish?: (courtNo: number) => void;
  readOnly?: boolean;
  compact?: boolean;
  dense?: boolean;
}

// Ported from the old CourtsGrid: the Courts tab (with Finish Game), the
// courts overlay and the empty home workspace (read-only). The public display
// has its own TV-sized card (features/display/display-court.tsx).
export function CourtsGrid({ courts, onFinish, readOnly = false, compact = false, dense = false }: Props) {
  const cards = courts.map((court) => (
    <CourtCard key={court.courtNo} court={court} onFinish={onFinish} readOnly={readOnly} compact={compact} dense={dense} />
  ));

  if (compact) {
    return (
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${dense ? "gap-2" : "gap-2.5"}`}>{cards}</div>
    );
  }

  // Courts per row follow the space the courts actually get (container query),
  // not the screen: next to the players panel on an iPad in portrait there is
  // room for 1, on a tablet in landscape 2, on a laptop 3.
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">{cards}</div>
    </div>
  );
}
