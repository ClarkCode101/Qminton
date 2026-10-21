import { z } from "zod";

// The highest fee we accept. Real fees are a few hundred pesos; this only
// stops typos like "50000000" from going in.
const MAX_PESOS = 100_000;

// A peso amount typed into a text box. Empty means 0, like the old app.
// Decimals are rejected with a readable message (old bug #5 showed "[object Object]").
function pesoAmount() {
  return z
    .string()
    .trim()
    .refine((value) => value === "" || Number.isFinite(Number(value)), "Enter a number")
    .refine((value) => value === "" || Number(value) >= 0, "Billing values cannot be negative")
    .refine((value) => value === "" || Number.isInteger(Number(value)), "Use whole pesos only (no centavos)")
    .refine((value) => value === "" || Number(value) <= MAX_PESOS, "Amount is too large")
    .transform((value) => (value === "" ? 0 : Number(value)));
}

// A new queue starts with this many courts (the database default too).
export const DEFAULT_COURT_COUNT = 2;
export const MIN_COURTS = 1;
export const MAX_COURTS = 6;

// A datetime-local value ("2026-10-25T19:00") that the browser can read.
export function isValidDateTimeLocal(value: string): boolean {
  return value.trim() !== "" && !Number.isNaN(new Date(value).getTime());
}

export const newQueueFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Please enter a queue name")
      .max(60, "Queue name must be 60 characters or less"),
    gameMode: z.enum(["singles", "doubles"]),
    courtCount: z.number().int().min(MIN_COURTS).max(MAX_COURTS),
    courtFee: pesoAmount(),
    gameRate: pesoAmount(),
    // "now" = play right away (as before); "later" = planned session with sign-ups.
    when: z.enum(["now", "later"]),
    // datetime-local text, only used for "later".
    startsAt: z.string(),
  })
  .refine((form) => form.when === "now" || isValidDateTimeLocal(form.startsAt), {
    message: "Please pick the date and time",
    path: ["startsAt"],
  });

// What the form fields hold (text) vs. what we send to the database (numbers).
export type NewQueueFormInput = z.input<typeof newQueueFormSchema>;
export type NewQueueFormOutput = z.output<typeof newQueueFormSchema>;

// Billing setup (court fee + shuttle rate), same rules as when creating a queue.
export const billingSetupSchema = z.object({
  courtFee: pesoAmount(),
  gameRate: pesoAmount(),
});

export type BillingSetupInput = z.input<typeof billingSetupSchema>;
export type BillingSetupOutput = z.output<typeof billingSetupSchema>;
