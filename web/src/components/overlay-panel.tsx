import { useEffect, useId, type ReactNode } from "react";

import { CloseButton } from "@/components/close-button";
interface Props {
  eyebrow: string;
  title: string;
  description?: string;
  tone?: "sky" | "indigo";
  maxWidthClassName?: string;
  onClose: () => void;
  children: ReactNode;
}

const TONES = {
  sky: { border: "border-sky-200", divider: "border-sky-100", eyebrow: "text-sky-500" },
  indigo: { border: "border-indigo-200", divider: "border-indigo-100", eyebrow: "text-indigo-500" },
} as const;

// The big overlays on the Courts tab (Up Next, all courts, Match Log),
// same frame as in the old QueueCourtsTab.
export function OverlayPanel({ eyebrow, title, description, tone = "sky", maxWidthClassName = "max-w-4xl", onClose, children }: Props) {
  const titleId = useId();
  const colors = TONES[tone];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[88vh] w-full flex-col overflow-hidden rounded-[28px] border bg-white shadow-2xl ${colors.border} ${maxWidthClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`flex items-start justify-between gap-4 border-b px-5 py-4 ${colors.divider}`}>
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${colors.eyebrow}`}>{eyebrow}</p>
            <h3 id={titleId} className="mt-1 text-xl font-black tracking-tight text-slate-900">
              {title}
            </h3>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <CloseButton label={`Close ${title}`} onClick={onClose} />
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
