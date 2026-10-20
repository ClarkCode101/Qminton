import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";

import { billingSetupSchema, type BillingSetupInput, type BillingSetupOutput } from "@/features/queues/queue-form-schema";

interface Props {
  courtFee: number;
  gameRate: number;
  // Should throw if saving fails.
  onSave: (data: BillingSetupOutput) => Promise<void>;
}

// The old app showed 0 as an empty box with a "0" placeholder.
const toInputValue = (value: number) => (value === 0 ? "" : String(value));

const inputClass =
  "w-full cursor-text select-text rounded-lg border bg-sky-50/50 p-3 text-sm text-slate-800 placeholder:text-slate-500";

// Court fee + shuttle rate (ported from the old SettingsPanel). Whole pesos only.
// Changing the court fee does not re-bill players who already joined (same as before).
export function BillingSetupForm({ courtFee, gameRate, onSave }: Props) {
  const ids = useId();
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BillingSetupInput, unknown, BillingSetupOutput>({
    resolver: zodResolver(billingSetupSchema),
    defaultValues: { courtFee: toInputValue(courtFee), gameRate: toInputValue(gameRate) },
  });

  const onSubmit = async (data: BillingSetupOutput) => {
    setNotice(null);
    try {
      await onSave(data);
      setNotice({ type: "success", message: "Billing setup saved." });
    } catch {
      setNotice({ type: "error", message: "Failed to save billing setup." });
    }
  };

  const fields = [
    { name: "courtFee", label: "Court Fee per Player (₱)" },
    { name: "gameRate", label: "Shuttle Rate per Game (₱)" },
  ] as const;

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} onChange={() => setNotice(null)}>
      <div className="mb-4 grid grid-cols-1 gap-4">
        {fields.map((field) => {
          const error = errors[field.name]?.message;
          return (
            <div key={field.name}>
              <label htmlFor={`${ids}-${field.name}`} className="mb-2 block text-sm font-medium text-slate-500">
                {field.label}
              </label>
              <input
                id={`${ids}-${field.name}`}
                type="text"
                inputMode="numeric"
                placeholder="0"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${ids}-${field.name}-error` : undefined}
                className={`${inputClass} ${error ? "border-rose-300" : "border-sky-200"}`}
                {...register(field.name)}
              />
              {error && (
                <p id={`${ids}-${field.name}-error`} className="mt-2 text-xs font-medium text-rose-600">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg border border-blue-600 bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 cursor-pointer disabled:cursor-not-allowed disabled:border-blue-300 disabled:bg-blue-300"
      >
        {isSubmitting ? "Saving..." : "Save Billing"}
      </button>
      {notice && (
        <p role="status" className={`mt-3 text-sm font-medium ${notice.type === "success" ? "text-emerald-600" : "text-rose-600"}`}>
          {notice.message}
        </p>
      )}
    </form>
  );
}
