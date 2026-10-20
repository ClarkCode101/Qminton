import { useState } from "react";

import { BillingModal } from "@/features/billing/billing-modal";
import { BillingSetupForm } from "@/features/billing/billing-setup-form";
import type { BillingSetupOutput } from "@/features/queues/queue-form-schema";
import { formatCurrency } from "@/lib/format";
import type { Queue } from "@/services/queues";

interface Props {
  queue: Queue;
  onSaveBillingSetup: (data: BillingSetupOutput) => Promise<void>;
}

// Billing tab. Step 6 has the Billing setup dialog (same text as the old app);
// the roster, payments and ledger are ported in step 10.
export function BillingTab({ queue, onSaveBillingSetup }: Props) {
  const [showSetup, setShowSetup] = useState(false);

  return (
    <div className="app-shell-safe-bottom flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,#eff6ff,#f8fbff_36%,#eef6ff)] p-4 sm:p-5 lg:p-6">
      {showSetup && (
        <BillingModal
          title="Billing setup"
          description="Court fee and shuttle rate. Open this when pricing needs to change."
          badge={`${formatCurrency(queue.court_fee)} + ${formatCurrency(queue.game_rate)}/game`}
          onClose={() => setShowSetup(false)}
          maxWidthClassName="max-w-xl"
        >
          <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Formula</p>
            <p className="mt-2 text-sm text-slate-600">
              Total billed = one-time court fee + (games played x shuttle rate) + manual adjustments.
            </p>
          </div>
          <BillingSetupForm courtFee={queue.court_fee} gameRate={queue.game_rate} onSave={onSaveBillingSetup} />
        </BillingModal>
      )}

      <section className="mx-auto max-w-6xl rounded-[28px] border border-sky-200 bg-white/95 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-sky-100 px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-500">Billing</p>
            <h1 className="mt-1 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{queue.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {formatCurrency(queue.court_fee)} court fee + {formatCurrency(queue.game_rate)} per game
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSetup(true)}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-sky-200 bg-white px-4 text-sm font-semibold text-sky-700 shadow-sm transition-colors hover:bg-sky-50 cursor-pointer"
          >
            Billing setup
          </button>
        </div>
        <p className="px-5 py-10 text-center text-sm text-slate-500 sm:px-6">
          Payments, balances and the activity log are being migrated to Qminton.
        </p>
      </section>
    </div>
  );
}
