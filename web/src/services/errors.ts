import { isTimeoutError } from "@/lib/fetch-with-timeout";

// Turns any error from Supabase into a sentence an organizer can read.
//
// Our database functions raise errors with code "P0001" and a plain message
// (e.g. "Queue not found"), so those are shown as-is. Anything else (network
// down, unexpected database error) gets the friendly `fallback` instead of a
// raw technical message or "[object Object]" (old bug #5).
export const SLOW_CONNECTION_MESSAGE = "The connection is slow and the server didn't answer in time. Check the courts, then try again.";

export function toUserMessage(error: unknown, fallback: string): string {
  // A request that gave up after 15 s (lib/fetch-with-timeout.ts). It may or
  // may not have been saved, hence "check the courts".
  if (isTimeoutError(error)) return SLOW_CONNECTION_MESSAGE;
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    if (error.code === "P0001" && typeof error.message === "string" && error.message) {
      return error.message;
    }
  }
  return fallback;
}
