// The ✕ that closes a dialog or overlay. One component so they all look and
// behave the same: calm gray, turning red on hover ("close" is clear, but red
// at rest would look like delete, which is red elsewhere in the app).
export function CloseButton({
  label,
  onClick,
  disabled = false,
  size = "md",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
        size === "sm" ? "h-9 w-9" : "h-10 w-10"
      }`}
    >
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="m6 6 8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="m14 6-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </button>
  );
}
