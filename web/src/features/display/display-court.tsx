import type { CourtView } from "@/features/courts/court-view";
import { useElapsedTime } from "@/features/courts/use-elapsed-time";

// One court on the TV display (owner's redesign, 2026-10-21): the card fills
// the space it gets, and the names and timer grow with it (sized from the
// card's width with container units), so they can be read from across the hall.
// Same colors and court lines as the court cards on the Courts tab.
export function DisplayCourt({ court }: { court: CourtView }) {
  const isAvailable = court.status === "available";
  const elapsed = useElapsedTime(isAvailable ? null : court.startedAt);

  return (
    // The outer box is the grid cell. The card fills it, but never gets taller
    // than ~60% of its width, so the court keeps a court's shape (with 2 courts
    // on a TV it would otherwise be stretched tall); it sits centered instead.
    // Phones: a fixed shape, one under the other.
    <div className="@container flex min-h-0 items-center">
      <section
        aria-label={`Court ${court.courtNo}`}
        className={`@container flex w-full flex-col overflow-hidden rounded-2xl border bg-white shadow-sm max-lg:aspect-[16/10] lg:h-full lg:max-h-[62cqi] ${
          isAvailable ? "border-slate-200" : "border-amber-300 ring-2 ring-amber-200/60"
        }`}
      >
      <div className={`flex items-center justify-between gap-3 px-[3cqi] py-[1.6cqi] ${isAvailable ? "bg-slate-50" : "bg-amber-50"}`}>
        <h2 className="text-[clamp(1rem,3.4cqi,2.25rem)] font-black tracking-tight text-slate-900">Court {court.courtNo}</h2>
        {isAvailable ? (
          <span className="rounded-full bg-emerald-100 px-[1.6cqi] py-[0.5cqi] text-[clamp(0.8rem,2.2cqi,1.4rem)] font-semibold text-emerald-700">
            Available
          </span>
        ) : (
          <span
            className="text-[clamp(1rem,3.4cqi,2.25rem)] font-black tabular-nums text-amber-600"
            aria-label={`Playing for ${elapsed}`}
          >
            {elapsed || "—"}
          </span>
        )}
      </div>

      {/* Court diagram: fills the rest of the card; lines are in percent so they stretch with it. */}
      <div className="relative min-h-0 flex-1" style={{ background: isAvailable ? "#2d8a4e" : "#1a7a3a" }}>
        <div className="absolute inset-[1.2cqi] border-2 border-white/90">
          <div className="absolute left-0 right-0 top-[7.5%] border-t border-white/70" />
          <div className="absolute bottom-[7.5%] left-0 right-0 border-b border-white/70" />
          <div className="absolute bottom-0 left-1/2 top-0 -translate-x-px border-l-2 border-dashed border-white/90" />
          <div className="absolute bottom-0 left-[35.2%] top-0 border-l border-white/70" />
          <div className="absolute bottom-0 right-[35.2%] top-0 border-r border-white/70" />
          <div className="absolute bottom-0 left-[5.7%] top-0 border-l border-white/70" />
          <div className="absolute bottom-0 right-[5.7%] top-0 border-r border-white/70" />
          <div className="absolute left-[5.7%] top-1/2 -translate-y-px border-t border-white/60" style={{ width: "29.5%" }} />
          <div className="absolute right-[5.7%] top-1/2 -translate-y-px border-t border-white/60" style={{ width: "29.5%" }} />
        </div>

        {!isAvailable &&
          [court.team1, court.team2].map((team, index) => (
            // Centered in each half on a dark backing, so court lines never cross the names.
            <div
              key={index}
              className={`absolute ${index === 0 ? "left-1/4" : "left-3/4"} top-1/2 z-10 flex max-w-[44%] -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-xl bg-slate-950/30 px-[2cqi] py-[1.2cqi] text-center`}
            >
              {team.map((player) => (
                <span
                  key={player.id}
                  className="max-w-full truncate text-[clamp(1.1rem,4.6cqi,3.5rem)] font-black leading-tight text-white"
                >
                  {player.name}
                </span>
              ))}
            </div>
          ))}
      </div>
      </section>
    </div>
  );
}
