import { useId } from "react";

// The Qminton mark: a "Q" whose tail is a shuttlecock, on a blue tile.
// Same drawing as public/favicon.svg (keep the two in sync).
export function QmintonMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  // Each copy on the page needs its own gradient id. useId() can contain
  // characters like ":" or "«»" that break url(#...), so keep letters/digits only.
  const gradientId = `qminton-bg-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradientId})`} />
      <g transform="translate(2 2)">
        {/* The ring of the Q */}
        <circle cx="26" cy="26" r="13" fill="none" stroke="#fff" strokeWidth="6.5" />
        {/* The tail: a shuttlecock (drawn cork-down, then turned to point down-right) */}
        <g transform="translate(37.5 37.5) rotate(-45)">
          <path d="M-8 0 L8 0 L3.6 13 L-3.6 13 Z" fill="#fff" />
          <path
            d="M-4 1.8 L-1.8 11.4 M0 1.8 L0 11.4 M4 1.8 L1.8 11.4 M-6.2 6.6 L6.2 6.6"
            stroke="#2563eb"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path d="M-4.2 14.6 A4.2 4.2 0 0 0 4.2 14.6 Z" fill="#fff" />
        </g>
      </g>
    </svg>
  );
}

// Mark + "Qminton" word with a blue "Q".
export function QmintonLogo({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <QmintonMark size={size} />
      <span className="font-black tracking-tight text-slate-900" style={{ fontSize: size * 0.55 }}>
        <span className="text-blue-600">Q</span>minton
      </span>
    </span>
  );
}
