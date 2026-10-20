import { fieldError, referenceSchema } from "@/features/billing/billing-form-schema";
import { PAYMENT_METHOD_OPTIONS } from "@/features/billing/billing-roster";
import type { PaymentMethod } from "@/services/billing";

interface Props {
  method: PaymentMethod;
  reference: string;
  onMethodChange: (method: PaymentMethod) => void;
  onReferenceChange: (reference: string) => void;
}

// Payment method + optional reference (ported from the old PaymentDetailsFields).
export function PaymentDetailsFields({ method, reference, onMethodChange, onReferenceChange }: Props) {
  const referenceError = fieldError(referenceSchema, reference);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Payment method</span>
        <select
          value={method}
          onChange={(event) => onMethodChange(event.target.value as PaymentMethod)}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400"
        >
          {PAYMENT_METHOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Reference</span>
        <input
          type="text"
          value={reference}
          onChange={(event) => onReferenceChange(event.target.value)}
          aria-invalid={referenceError ? true : undefined}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-500 focus:border-sky-400"
          placeholder="GCash ref, OR no., etc."
        />
        {referenceError && <span className="mt-1 block text-xs text-rose-600">{referenceError}</span>}
      </label>
    </div>
  );
}
