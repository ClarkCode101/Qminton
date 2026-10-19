// Full-screen badminton court (top view) used behind the login card.
// Same green and line positions as the court cards in features/courts/courts-grid.tsx,
// but with faint lines so they set the scene without pulling the eye from the form.
// The whole court keeps its real 13.4 m x 6.1 m shape and fits inside the screen;
// on portrait screens (phones) it is turned upright so it fills the height.
export function CourtBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#2d8a4e]" aria-hidden="true">
      <div className="absolute left-1/2 top-1/2 aspect-[13.4/6.1] w-[92vw] max-w-[calc(92vh*13.4/6.1)] -translate-x-1/2 -translate-y-1/2 portrait:w-[92vh] portrait:max-w-[calc(92vw*13.4/6.1)] portrait:rotate-90">
        <div className="absolute inset-0 border-4 border-white/45">
          <div className="absolute left-0 right-0 top-[7.5%] border-t-2 border-white/30" />
          <div className="absolute left-0 right-0 bottom-[7.5%] border-b-2 border-white/30" />
          <div className="absolute top-0 bottom-0 left-1/2 -translate-x-px border-l-4 border-dashed border-white/35" />
          <div className="absolute top-0 bottom-0 left-[35.2%] border-l-2 border-white/30" />
          <div className="absolute top-0 bottom-0 right-[35.2%] border-r-2 border-white/30" />
          <div className="absolute top-0 bottom-0 left-[5.7%] border-l-2 border-white/30" />
          <div className="absolute top-0 bottom-0 right-[5.7%] border-r-2 border-white/30" />
          <div className="absolute top-1/2 left-[5.7%] w-[29.5%] -translate-y-px border-t-2 border-white/25" />
          <div className="absolute top-1/2 right-[5.7%] w-[29.5%] -translate-y-px border-t-2 border-white/25" />
        </div>
      </div>
      {/* Soft shading so the white card stands out from the lines. */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.05),rgba(15,23,42,0.35))]" />
    </div>
  );
}
