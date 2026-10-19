// Shown when data can't be loaded (e.g. no internet). It stays on the current
// page and offers a retry, instead of kicking the organizer out (old bug #4).
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#eff6ff,#f8fbff_36%,#eef6ff)] p-4">
      <div role="alert" className="w-full max-w-md rounded-[28px] border border-sky-200 bg-white p-6 text-center shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-500">Connection Problem</p>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 cursor-pointer"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
