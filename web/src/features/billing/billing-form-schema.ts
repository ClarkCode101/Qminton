import { z } from "zod";

// Same limits as the database (supabase/migrations/20261024120000_billing.sql).
export const MAX_BILLING_PESOS = 100_000;
export const MAX_NOTE_LENGTH = 300;
export const MAX_REFERENCE_LENGTH = 80;

// Marks "not filled in yet": the save button stays disabled but no error is shown.
const NOT_FILLED = "not-filled";

// Whole pesos typed into a text box. Like the old app, blank or 0 is "not
// filled in yet" (the save button stays disabled); decimals get a readable error.
function wholePesos() {
  return z
    .string()
    .trim()
    .min(1, NOT_FILLED)
    .refine((value) => Number.isFinite(Number(value)), "Enter a number")
    .refine((value) => Number.isInteger(Number(value)), "Use whole pesos only (no centavos)")
    .transform(Number);
}

// Adjustments and shared fees: + adds a charge, - is a refund or discount.
export const signedAmountSchema = wholePesos()
  .refine((value) => value !== 0, NOT_FILLED)
  .refine((value) => Math.abs(value) <= MAX_BILLING_PESOS, "Amount must be 100,000 or less");

export function partialPaymentSchema(outstandingBalance: number) {
  return wholePesos()
    .refine((value) => value > 0, "Payment amount must be greater than zero")
    .refine((value) => value <= outstandingBalance, "Payment amount exceeds remaining balance");
}

export const noteSchema = z
  .string()
  .trim()
  .min(1, NOT_FILLED)
  .max(MAX_NOTE_LENGTH, `Note must be ${MAX_NOTE_LENGTH} characters or less`);

export const referenceSchema = z
  .string()
  .trim()
  .max(MAX_REFERENCE_LENGTH, `Reference must be ${MAX_REFERENCE_LENGTH} characters or less`);

// Error text to show under a field (nothing while it is blank / not filled yet).
export function fieldError(schema: z.ZodType, value: string): string | null {
  const result = schema.safeParse(value);
  if (result.success) return null;
  const message = result.error.issues[0]?.message;
  return message && message !== NOT_FILLED ? message : null;
}

export function isValid(schema: z.ZodType, value: string): boolean {
  return schema.safeParse(value).success;
}

// The typed value as a number for previews (0 when not a valid number yet).
export function previewAmount(value: string): number {
  const parsed = Number(value.trim());
  return value.trim() && Number.isInteger(parsed) ? parsed : 0;
}
