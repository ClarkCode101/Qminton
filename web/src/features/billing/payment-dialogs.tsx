import { useState, type ReactNode } from "react";

import { BillingModal } from "@/features/billing/billing-modal";
import {
  fieldError,
  isValid,
  partialPaymentSchema,
  previewAmount,
  referenceSchema,
} from "@/features/billing/billing-form-schema";
import { PaymentDetailsFields } from "@/features/billing/payment-details-fields";
import { formatCurrency } from "@/lib/format";
import type { PaymentDetails, PaymentMethod } from "@/services/billing";

// The four payment confirmations of the old Billing tab, same texts and colors.
// Each dialog waits for onConfirm; if saving fails it stays open (the error is a toast).

const cancelButtonClass =
  "inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";
const confirmButtonClass = {
  emerald:
    "inline-flex rounded-full border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:border-emerald-300 disabled:bg-emerald-300 cursor-pointer",
  sky: "inline-flex rounded-full border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:border-sky-300 disabled:bg-sky-300 cursor-pointer",
  amber:
    "inline-flex rounded-full border border-amber-500 bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:border-amber-300 disabled:bg-amber-300 cursor-pointer",
};

function DialogButtons({
  busy,
  disabled = false,
  tone,
  label,
  busyLabel = "Saving...",
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  disabled?: boolean;
  tone: keyof typeof confirmButtonClass;
  label: string;
  busyLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex justify-end gap-3">
      <button type="button" onClick={onCancel} disabled={busy} className={cancelButtonClass}>
        Cancel
      </button>
      <button type="button" onClick={onConfirm} disabled={busy || disabled} className={confirmButtonClass[tone]}>
        {busy ? busyLabel : label}
      </button>
    </div>
  );
}

function InfoBox({ tone = "sky", children }: { tone?: "sky" | "amber"; children: ReactNode }) {
  const className =
    tone === "amber" ? "border-amber-200 bg-amber-50/80" : "border-sky-200 bg-sky-50/80";
  return <div className={`rounded-2xl border p-4 text-sm text-slate-600 ${className}`}>{children}</div>;
}

// Shared state for the method + reference fields.
function usePaymentDetails() {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const details: PaymentDetails = { paymentMethod: method, paymentReference: reference.trim() || undefined };
  const fields = (
    <PaymentDetailsFields method={method} reference={reference} onMethodChange={setMethod} onReferenceChange={setReference} />
  );
  return { details, fields, referenceOk: isValid(referenceSchema, reference) };
}

interface PlayerPaymentProps {
  playerName: string;
  outstandingBalance: number;
  busy: boolean;
  onClose: () => void;
}

export function MarkPaidDialog({
  playerName,
  outstandingBalance,
  busy,
  onClose,
  onConfirm,
}: PlayerPaymentProps & { onConfirm: (details: PaymentDetails) => Promise<void> }) {
  const { details, fields, referenceOk } = usePaymentDetails();
  const close = () => !busy && onClose();

  return (
    <BillingModal
      title="Confirm payment"
      description={`Mark ${playerName} as paid for ${formatCurrency(outstandingBalance)}?`}
      onClose={close}
      maxWidthClassName="max-w-md"
    >
      <div className="space-y-4">
        <InfoBox>This will record a payment entry and remove the remaining balance from this player&apos;s unpaid status.</InfoBox>
        {fields}
        <DialogButtons
          busy={busy}
          disabled={!referenceOk}
          tone="emerald"
          label="Confirm payment"
          onCancel={close}
          onConfirm={() => void onConfirm(details)}
        />
      </div>
    </BillingModal>
  );
}

export function PartialPaymentDialog({
  playerName,
  outstandingBalance,
  busy,
  onClose,
  onConfirm,
}: PlayerPaymentProps & { onConfirm: (details: PaymentDetails & { amount: number }) => Promise<void> }) {
  const { details, fields, referenceOk } = usePaymentDetails();
  const [amount, setAmount] = useState(String(outstandingBalance));
  const schema = partialPaymentSchema(outstandingBalance);
  const amountError = fieldError(schema, amount);
  const amountOk = isValid(schema, amount);
  const close = () => !busy && onClose();

  return (
    <BillingModal
      title="Partial payment"
      description={`Record a payment for ${playerName} up to ${formatCurrency(outstandingBalance)}.`}
      onClose={close}
      maxWidthClassName="max-w-md"
    >
      <div className="space-y-4">
        <InfoBox>
          This records a payment entry without clearing the full balance unless the entered amount matches the remaining due.
        </InfoBox>
        <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Partial payment amount
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-invalid={amountError ? true : undefined}
            className="mt-2 w-full rounded-2xl border border-sky-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-800 outline-none transition focus:border-sky-400"
          />
          {amountError && <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-rose-600">{amountError}</span>}
        </label>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
          <div>Current balance: {formatCurrency(outstandingBalance)}</div>
          <div className="mt-1">
            Remaining after payment: {formatCurrency(Math.max(outstandingBalance - previewAmount(amount), 0))}
          </div>
        </div>
        {fields}
        <DialogButtons
          busy={busy}
          disabled={!amountOk || !referenceOk}
          tone="sky"
          label="Save partial payment"
          onCancel={close}
          onConfirm={() => void onConfirm({ ...details, amount: Number(amount.trim()) })}
        />
      </div>
    </BillingModal>
  );
}

export function BulkPaymentDialog({
  playerNames,
  totalOutstanding,
  busy,
  onClose,
  onConfirm,
}: {
  playerNames: string[];
  totalOutstanding: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (details: PaymentDetails) => Promise<void>;
}) {
  const { details, fields, referenceOk } = usePaymentDetails();
  const close = () => !busy && onClose();

  return (
    <BillingModal
      title="Confirm bulk payment"
      description={`Mark ${playerNames.length} selected players as paid for ${formatCurrency(totalOutstanding)}?`}
      onClose={close}
      maxWidthClassName="max-w-2xl"
    >
      <div className="space-y-4">
        <InfoBox>This records full payment entries for every selected player who still has an open balance.</InfoBox>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Selected players</div>
          <div className="mt-2">
            {playerNames.slice(0, 6).join(", ")}
            {playerNames.length > 6 ? ` + ${playerNames.length - 6} more` : ""}
          </div>
        </div>
        {fields}
        <DialogButtons
          busy={busy}
          disabled={!referenceOk}
          tone="emerald"
          label="Confirm bulk payment"
          onCancel={close}
          onConfirm={() => void onConfirm(details)}
        />
      </div>
    </BillingModal>
  );
}

export function UndoPaymentDialog({
  playerName,
  paymentAmount,
  busy,
  onClose,
  onConfirm,
}: {
  playerName: string;
  paymentAmount: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const close = () => !busy && onClose();

  return (
    <BillingModal
      title="Undo payment"
      description={`Restore ${playerName}'s unpaid balance for ${formatCurrency(paymentAmount)}?`}
      onClose={close}
      maxWidthClassName="max-w-md"
    >
      <div className="space-y-4">
        <InfoBox tone="amber">This adds a payment reversal entry so the last payment amount shows as unpaid again.</InfoBox>
        <DialogButtons
          busy={busy}
          tone="amber"
          label="Undo payment"
          busyLabel="Reverting..."
          onCancel={close}
          onConfirm={() => void onConfirm()}
        />
      </div>
    </BillingModal>
  );
}
