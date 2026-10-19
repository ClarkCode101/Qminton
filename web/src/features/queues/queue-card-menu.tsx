import { useEffect, useRef, useState } from "react";

// The "⋯" button on a queue card. Delete lives in here instead of next to the
// main click target, so it can't be hit by accident.
export function QueueCardMenu({ queueName, onDelete }: { queueName: string; onDelete: () => void }) {
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
    // z-10 keeps the menu above the card's full-size link.
    <div ref={menuRef} className="relative z-10">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={`More actions for ${queueName}`}
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
          className="queue-list-panel absolute right-0 top-9 w-40 overflow-hidden rounded-2xl border border-sky-200 bg-white p-1 shadow-[0_20px_40px_rgba(14,116,144,0.16)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              onDelete();
            }}
            className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 cursor-pointer"
          >
            Delete queue
          </button>
        </div>
      )}
    </div>
  );
}
