import { useEffect, useRef, useState } from "react";

export interface MoreMenuItem {
  label: string;
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
}

// A "⋯" button with a small menu. Risky or rarely used actions (Delete queue,
// Reset Matchmaking) live here so they can't be hit by accident.
export function MoreMenu({ label, items, className = "relative" }: { label: string; items: MoreMenuItem[]; className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close on a click outside or on Escape, like the navbar popups.
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className={className}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer ${
          isOpen ? "bg-slate-100 text-slate-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <circle cx="4.5" cy="10" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="15.5" cy="10" r="1.5" />
        </svg>
      </button>

      {isOpen && (
        <div
          role="menu"
          className="queue-list-panel absolute right-0 top-9 z-30 w-48 overflow-hidden rounded-2xl border border-sky-200 bg-white p-1 shadow-[0_20px_40px_rgba(14,116,144,0.16)]"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setIsOpen(false);
                item.onSelect();
              }}
              className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                item.tone === "danger" ? "text-rose-600 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
