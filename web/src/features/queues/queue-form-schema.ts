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

export const newQueueFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please enter a queue name")
    .max(60, "Queue name must be 60 characters or less"),
  gameMode: z.enum(["singles", "doubles"]),
  courtFee: pesoAmount(),
  gameRate: pesoAmount(),
});

// What the form fields hold (text) vs. what we send to the database (numbers).
export type NewQueueFormInput = z.input<typeof newQueueFormSchema>;
export type NewQueueFormOutput = z.output<typeof newQueueFormSchema>;
