import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId } from "react";
import { useForm, useWatch } from "react-hook-form";

import {
  newQueueFormSchema,
  type NewQueueFormInput,
  type NewQueueFormOutput,
} from "@/features/queues/queue-form-schema";
import type { GameMode } from "@/services/queues";

interface Props {
  // Should throw if saving fails; the modal then stays open so nothing typed is lost.
  onCreate: (data: NewQueueFormOutput) => Promise<void>;
  onClose: () => void;
}

const gameModes: { value: GameMode; label: string; desc: string }[] = [
  { value: "singles", label: "Singles", desc: "1 vs 1" },
  { value: "doubles", label: "Doubles", desc: "2 vs 2" },
];

const fieldBoxClass =
  "rounded-2xl border bg-sky-50/45 px-3.5 py-2.5 transition-colors focus-within:bg-white";

function borderClass(hasError: boolean) {
  return hasError ? "border-rose-300" : "border-sky-100 focus-within:border-sky-200";
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-2 text-xs font-medium text-rose-600">
      {message}
    </p>
  );
}

// "New Queue" dialog, same layout as the old NewQueueModal.
export function NewQueueModal({ onCreate, onClose }: Props) {
  const ids = useId();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<NewQueueFormInput, unknown, NewQueueFormOutput>({
    resolver: zodResolver(newQueueFormSchema),
    defaultValues: { name: "", gameMode: "doubles", courtFee: "0", gameRate: "0" },
  });
  const selectedMode = useWatch({ control, name: "gameMode" });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onClose]);

  const onSubmit = async (data: NewQueueFormOutput) => {
    try {
      await onCreate(data);
    } catch {
      // The caller already showed a toast; keep the form open.
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"
      onClick={isSubmitting ? undefined : onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-lg rounded-[28px] border border-sky-200 bg-white p-5 shadow-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">Create Queue</p>
            <h2 id={`${ids}-title`} className="mt-2 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
              New Queue
            </h2>
            <p className="mt-1.5 text-sm leading-5 text-slate-500">Set up a fresh board for your next session.</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sky-100 bg-white text-slate-400 transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-slate-600 cursor-pointer"
            aria-label="Close new queue modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor={`${ids}-name`} className="mb-2 block text-sm font-medium text-slate-600">
              Queue Name
            </label>
            <div className={`${fieldBoxClass} ${borderClass(Boolean(errors.name))}`}>
              <input
                id={`${ids}-name`}
                type="text"
                maxLength={60}
                placeholder="e.g. Saturday Session"
                autoFocus
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? `${ids}-name-error` : undefined}
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                {...register("name")}
              />
            </div>
            <FieldError id={`${ids}-name-error`} message={errors.name?.message} />
          </div>

          <fieldset>
            <legend className="mb-2.5 block text-sm font-medium text-slate-600">Game Mode</legend>
            <div className="grid grid-cols-2 gap-3">
              {gameModes.map((gameMode) => {
                const isSelected = selectedMode === gameMode.value;

                return (
                  <button
                    key={gameMode.value}
                    type="button"
                    onClick={() => setValue("gameMode", gameMode.value)}
                    aria-pressed={isSelected}
                    className={`rounded-2xl border px-3.5 py-3 text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-blue-600 bg-blue-50/80 shadow-sm"
                        : "border-sky-100 bg-white hover:border-sky-200 hover:bg-sky-50/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className={`text-sm font-semibold ${isSelected ? "text-blue-800" : "text-slate-800"}`}>
                          {gameMode.label}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-400">{gameMode.desc}</div>
                      </div>

                      <span
                        className={`mt-0.5 inline-flex h-4.5 w-4.5 items-center justify-center rounded-full border ${
                          isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-sky-200 bg-white text-transparent"
                        }`}
                        aria-hidden="true"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                        </svg>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <p className="block text-sm font-medium text-slate-600">Billing Setup</p>
              <span className="text-[11px] font-medium text-slate-400">You can change this later</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  { field: "courtFee", label: "Court Fee per Player" },
                  { field: "gameRate", label: "Shuttle Rate per Game" },
                ] as const
              ).map(({ field, label }) => (
                <div key={field}>
                  <div className={`${fieldBoxClass} ${borderClass(Boolean(errors[field]))}`}>
                    <label htmlFor={`${ids}-${field}`} className="mb-1 block text-xs font-medium text-slate-500">
                      {label}
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-400" aria-hidden="true">
                        ₱
                      </span>
                      <input
                        id={`${ids}-${field}`}
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        aria-invalid={errors[field] ? true : undefined}
                        aria-describedby={errors[field] ? `${ids}-${field}-error` : undefined}
                        className="w-full bg-transparent text-sm text-slate-800 outline-none"
                        {...register(field)}
                      />
                    </div>
                  </div>
                  <FieldError id={`${ids}-${field}-error`} message={errors[field]?.message} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
          >
            {isSubmitting ? "Creating..." : "Create Queue"}
          </button>
        </div>
      </form>
    </div>
  );
}
