import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId } from "react";
import { useForm, useWatch } from "react-hook-form";

import { CloseButton } from "@/components/close-button";
import { DateTimePicker } from "@/components/date-time-picker";
import {
  DEFAULT_COURT_COUNT,
  MAX_COURTS,
  MIN_COURTS,
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

const gameModes: { value: GameMode; label: string }[] = [
  { value: "singles", label: "Singles" },
  { value: "doubles", label: "Doubles" },
];

const billingFields = [
  { field: "courtFee", label: "Court fee", hint: "Per player, once when they join" },
  { field: "gameRate", label: "Shuttle rate", hint: "Per player, every game they play" },
] as const;

const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

function inputBoxClass(hasError: boolean) {
  return `flex h-11 items-center gap-2 rounded-xl border bg-white px-3.5 transition-colors focus-within:ring-2 ${
    hasError ? "border-rose-300 focus-within:ring-rose-100" : "border-slate-200 focus-within:border-blue-400 focus-within:ring-blue-100"
  }`;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-xs font-medium text-rose-600">
      {message}
    </p>
  );
}

// "New Queue" dialog. Redesigned 2026-10-21 (owner): one title, Singles/Doubles
// as a switch, Courts set here, clear peso fields with a hint each. Closes
// only with ✕, Cancel or Esc, never by a tap outside (nothing typed is lost).
export function NewQueueModal({ onCreate, onClose }: Props) {
  const ids = useId();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<NewQueueFormInput, unknown, NewQueueFormOutput>({
    resolver: zodResolver(newQueueFormSchema),
    defaultValues: {
      name: "",
      gameMode: "doubles",
      courtCount: DEFAULT_COURT_COUNT,
      courtFee: "",
      gameRate: "",
      when: "now",
      startsAt: "",
    },
  });
  const selectedMode = useWatch({ control, name: "gameMode" });
  const courtCount = useWatch({ control, name: "courtCount" });
  const when = useWatch({ control, name: "when" });
  const startsAt = useWatch({ control, name: "startsAt" });

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

  const stepButtonClass =
    "inline-flex h-11 w-11 items-center justify-center text-lg font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent cursor-pointer";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-[28px] border border-sky-200 bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id={`${ids}-title`} className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
            New Queue
          </h2>
          <CloseButton label="Close new queue modal" onClick={onClose} disabled={isSubmitting} size="sm" />
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <label htmlFor={`${ids}-name`} className={labelClass}>
              Queue name
            </label>
            <div className={inputBoxClass(Boolean(errors.name))}>
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

          {/* Owner's addition: plan a session ahead and let people sign up from a shared link. */}
          <fieldset>
            <legend className={labelClass}>When</legend>
            <div className="grid h-11 grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              {(
                [
                  { value: "now", label: "Start now" },
                  { value: "later", label: "Plan for later" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setValue("when", option.value)}
                  aria-pressed={when === option.value}
                  className={`rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                    when === option.value ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {when === "later" && (
              <div className="mt-3">
                <DateTimePicker
                  value={startsAt}
                  invalid={Boolean(errors.startsAt)}
                  describedBy={`${ids}-startsAt-hint${errors.startsAt ? ` ${ids}-startsAt-error` : ""}`}
                  onChange={(value) => setValue("startsAt", value, { shouldValidate: isSubmitted })}
                />
                <p id={`${ids}-startsAt-hint`} className="mt-2 text-xs text-slate-500">
                  You get a link to share in your group chat. People sign up and can cancel; no charges until you start.
                </p>
                <FieldError id={`${ids}-startsAt-error`} message={errors.startsAt?.message} />
              </div>
            )}
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
            <fieldset>
              <legend className={labelClass}>Game mode</legend>
              <div className="grid h-11 grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                {gameModes.map((gameMode) => {
                  const isSelected = selectedMode === gameMode.value;
                  return (
                    <button
                      key={gameMode.value}
                      type="button"
                      onClick={() => setValue("gameMode", gameMode.value)}
                      aria-pressed={isSelected}
                      className={`rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                        isSelected ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {gameMode.label}
                      <span aria-hidden="true" className="ml-1.5 text-xs font-medium text-slate-400">{gameMode.value === "singles" ? "1v1" : "2v2"}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <span id={`${ids}-courts`} className={labelClass}>
                Courts
              </span>
              <div
                role="group"
                aria-labelledby={`${ids}-courts`}
                className="inline-flex h-11 items-center overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <button
                  type="button"
                  aria-label="Fewer courts"
                  disabled={courtCount <= MIN_COURTS}
                  onClick={() => setValue("courtCount", courtCount - 1)}
                  className={stepButtonClass}
                >
                  −
                </button>
                <span aria-live="polite" className="w-10 text-center text-base font-bold tabular-nums text-slate-900">
                  {courtCount}
                </span>
                <button
                  type="button"
                  aria-label="More courts"
                  disabled={courtCount >= MAX_COURTS}
                  onClick={() => setValue("courtCount", courtCount + 1)}
                  className={stepButtonClass}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {billingFields.map(({ field, label, hint }) => (
              <div key={field}>
                <label htmlFor={`${ids}-${field}`} className={labelClass}>
                  {label}
                </label>
                <div className={inputBoxClass(Boolean(errors[field]))}>
                  <span className="text-sm font-medium text-slate-400" aria-hidden="true">
                    ₱
                  </span>
                  <input
                    id={`${ids}-${field}`}
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    aria-invalid={errors[field] ? true : undefined}
                    aria-describedby={`${ids}-${field}-hint${errors[field] ? ` ${ids}-${field}-error` : ""}`}
                    className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    {...register(field)}
                  />
                </div>
                <p id={`${ids}-${field}-hint`} className="mt-1.5 text-xs text-slate-500">
                  {hint}
                </p>
                <FieldError id={`${ids}-${field}-error`} message={errors[field]?.message} />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">You can change these later.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
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
        </div>
      </form>
    </div>
  );
}
