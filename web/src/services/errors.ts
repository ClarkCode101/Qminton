// Turns any error from Supabase into a sentence an organizer can read.
//
// Our database functions raise errors with code "P0001" and a plain message
// (e.g. "Queue not found"), so those are shown as-is. Anything else (network
// down, unexpected database error) gets the friendly `fallback` instead of a
// raw technical message or "[object Object]" (old bug #5).
export function toUserMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    if (error.code === "P0001" && typeof error.message === "string" && error.message) {
      return error.message;
    }
  }
  return fallback;
}
