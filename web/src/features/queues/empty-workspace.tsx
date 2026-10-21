import type { NavTab } from "@/app/nav-tabs";
import { getEmptyCourts } from "@/features/courts/court-view";
import { CourtsGrid } from "@/features/courts/courts-grid";

// Preview screens shown on "/" when the organizer has no queue yet
// (ported from the old app/page.tsx: EmptyCourtsTab / EmptyBillingTab; the Players tab was removed).

const EMPTY_COURTS_PREVIEW = getEmptyCourts(2);
const PLAYERS_PREVIEW = ["Bench slot 1", "Bench slot 2", "Bench slot 3"];
const BILLING_PREVIEW = [
  { label: "Collected", value: "₱0" },
  { label: "Shuttle/Game", value: "₱0" },
  { label: "Court Fee", value: "₱0" },
];

const primaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 cursor-pointer";

function PreviewBenchCard({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`flex flex-col rounded-3xl border border-emerald-100 bg-[linear-gradient(180deg,#ffffff_0%,#f3fff8_100%)] px-4 py-3.5 shadow-sm lg:py-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="h-3 w-20 rounded-full bg-emerald-100" />
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600">
          Ready
        </span>
      </div>
      <div className="mt-4 h-5 rounded-full bg-slate-100" />
      <p className="mt-2.5 text-sm text-slate-400">{label}</p>
    </div>
  );
}

function PreviewMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-sky-100 bg-white px-4 py-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function EmptyCourtsTab({ onCreateQueue }: { onCreateQueue: () => void }) {
  return (
    <div className="flex-1 overflow-hidden bg-[radial-gradient(circle_at_top_left,#eff6ff,#f8fbff_36%,#eef6ff)]">
      <div className="app-shell-safe-bottom mx-auto h-full w-full max-w-450 p-4 sm:p-5 lg:p-6">
        <div className="grid h-full min-h-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(264px,292px)] lg:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(292px,324px)] xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,352px)]">
          <section className="order-1 min-w-0">
            <section className="flex h-full min-h-0 flex-col rounded-[28px] border border-sky-200 bg-white/95 shadow-sm backdrop-blur-sm">
              <div className="border-b border-sky-100 px-4 py-3 sm:px-5 sm:py-4">
                <div className="flex flex-col gap-2.5 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-500">Live Courts</p>
                    <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1.5">
                      <h1 className="truncate text-xl font-black tracking-tight text-slate-900 sm:text-[1.55rem]">
                        No active queue yet
                      </h1>
                      <div className="flex flex-wrap items-center gap-2 text-[13px] sm:text-sm">
                        <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-sky-100 bg-sky-50/70 px-3 py-1 text-slate-700">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">Shuttle/Game</span>
                          <span className="h-3.5 w-px bg-sky-100" />
                          <span className="font-semibold text-slate-900">₱0</span>
                        </span>
                        <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 shadow-sm">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Court Fee</span>
                          <span className="h-3.5 w-px bg-slate-200" />
                          <span className="font-semibold text-slate-900">₱0</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <button type="button" onClick={onCreateQueue} className={`${primaryButtonClass} w-full px-4.5 sm:w-auto md:min-w-40`}>
                    + New Queue
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 p-5 sm:p-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-sky-100 bg-slate-50/80 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="inline-flex min-h-9 items-center gap-3 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-slate-600 shadow-sm">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-500">Court Count</span>
                      <span className="h-4 w-px bg-sky-100" />
                      <span className="min-w-5 text-center text-lg font-black leading-none text-slate-900">2</span>
                    </div>
                    <div className="inline-flex items-center gap-2 px-1 py-1 text-sm font-medium text-slate-600">
                      <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />
                      <span>0 of 2 courts in use</span>
                    </div>
                  </div>

                  <div className="inline-flex min-h-8 items-center rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700">
                    Create a queue to unlock live controls
                  </div>
                </div>

                <div className="min-h-0">
                  <CourtsGrid courts={EMPTY_COURTS_PREVIEW} readOnly />
                </div>
              </div>
            </section>
          </section>

          <aside className="order-2 space-y-3 md:sticky md:top-6 md:flex md:h-[calc(100vh-7rem)] md:flex-col md:gap-3 md:self-start md:overflow-hidden md:space-y-0">
            <div className="md:min-h-0 md:flex-1">
              <section className="overflow-hidden rounded-[28px] border border-emerald-100 bg-white/95 shadow-sm backdrop-blur-sm md:flex md:h-full md:min-h-0 md:flex-col">
                <div className="border-b border-emerald-100 px-4 py-4 sm:px-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xl font-black tracking-tight text-slate-900">Players</p>
                      <p className="mt-1 text-sm text-slate-500">0 players</p>
                    </div>
                    <button type="button" onClick={onCreateQueue} className={`${primaryButtonClass} px-4`}>
                      Add Queue
                    </button>
                  </div>
                </div>

                <div className="space-y-3 p-4 sm:p-5 md:grid md:min-h-0 md:flex-1 md:grid-rows-[repeat(3,minmax(0,1fr))_auto] md:gap-3 md:space-y-0 md:overflow-hidden">
                  {PLAYERS_PREVIEW.map((playerLabel) => (
                    <PreviewBenchCard key={playerLabel} label={playerLabel} className="md:h-full" />
                  ))}

                  <div className="rounded-3xl border border-sky-100 bg-sky-50/45 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-600">Empty Workspace</p>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      The navbar stays available below, so you can check the Billing empty state before starting a queue.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function EmptyBillingTab({ onCreateQueue }: { onCreateQueue: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,#eff6ff,#f8fbff_36%,#eef6ff)] md:overflow-hidden">
      <div className="app-shell-safe-bottom mx-auto h-full w-full max-w-6xl p-4 sm:p-5 lg:p-6">
        <section className="overflow-hidden rounded-[28px] border border-sky-200 bg-white/95 shadow-sm backdrop-blur-sm md:flex md:h-full md:min-h-0 md:flex-col">
          <div className="border-b border-sky-100 px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-500">Billing</p>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                  Collections stay empty until a board opens.
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Billing tools become active only after you create a queue. This preview keeps the tab visible so the app still feels complete even before setup.
                </p>
              </div>

              <button type="button" onClick={onCreateQueue} className={`${primaryButtonClass} px-5`}>
                + Create Queue
              </button>
            </div>
          </div>

          <div className="space-y-4 p-5 sm:p-6 md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden">
            <div className="grid gap-3 sm:grid-cols-3">
              {BILLING_PREVIEW.map((item) => (
                <PreviewMetricCard key={item.label} label={item.label} value={item.value} />
              ))}
            </div>

            <div className="grid gap-4 md:min-h-0 md:flex-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,340px)]">
              <div className="rounded-[28px] border border-sky-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-5 shadow-sm md:flex md:min-h-0 md:flex-col">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-600">Ledger Preview</p>
                <div className="mt-4 rounded-3xl border border-dashed border-sky-200 bg-sky-50/55 px-6 py-12 text-center md:flex md:min-h-0 md:flex-1 md:items-center md:justify-center">
                  <div>
                    <p className="text-lg font-semibold text-slate-700">No billing records yet</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      The ledger appears here once matches start and payments are recorded.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 md:grid md:min-h-0 md:grid-rows-2 md:gap-4 md:space-y-0">
                <div className="rounded-[28px] border border-emerald-100 bg-[linear-gradient(180deg,#ffffff_0%,#f3fff8_100%)] p-5 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">Included After Setup</p>
                  <div className="mt-4 space-y-3 text-sm text-slate-600">
                    <p>Payment status per player.</p>
                    <p>Shared fees and manual adjustments.</p>
                    <p>Live ledger history and payment reversal tools.</p>
                  </div>
                </div>

                <div className="rounded-[28px] border border-amber-100 bg-[linear-gradient(180deg,#fffdf5_0%,#ffffff_100%)] p-5 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Before You Start</p>
                  <p className="mt-4 text-sm leading-6 text-slate-600">
                    Open a queue first, then add players and set your rates. The full billing workspace will inherit those values automatically.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export function EmptyWorkspaceTab({ tab, onCreateQueue }: { tab: NavTab; onCreateQueue: () => void }) {
  if (tab === "billing") return <EmptyBillingTab onCreateQueue={onCreateQueue} />;
  return <EmptyCourtsTab onCreateQueue={onCreateQueue} />;
}
