import { useEffect, useId } from "react";

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  tone?: "danger" | "default";
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

const TONE_STYLES = {
  danger: {
    eyebrow: "text-rose-500",
    confirmButton: "bg-rose-500 text-white hover:bg-rose-600",
  },
  default: {
    eyebrow: "text-sky-500",
    confirmButton: "bg-blue-600 text-white hover:bg-blue-700",
  },
} as const;

// "Are you sure?" dialog (ported from the old ConfirmActionModal).
export function ConfirmActionModal({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  tone = "danger",
  onConfirm,
  onClose,
}: Props) {
  const toneStyles = TONE_STYLES[tone];
  const titleId = useId();

  // Escape closes the dialog, unless the action is still running.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-[28px] border border-sky-200 bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${toneStyles.eyebrow}`}>
          Confirm Action
        </p>
        <h2 id={titleId} className="mt-2 text-xl font-black tracking-tight text-slate-900">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">{message}</p>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={busy}
            autoFocus
            className={`inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${toneStyles.confirmButton}`}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
