// Every request to Supabase gives up after this long. Found 2026-10-21: on a
// slow connection some requests reached the server 20–47 s late, and the
// screen sat on old data ("Picking teams...") the whole time. Failing instead
// lets the screen say so and reload (queries retry once by themselves).
export const REQUEST_TIMEOUT_MS = 15_000;

export function fetchWithTimeout(timeoutMs = REQUEST_TIMEOUT_MS, baseFetch: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
    // Keep any cancel signal the caller passed in (e.g. a query being dropped).
    const outer = init?.signal;
    if (outer) {
      if (outer.aborted) controller.abort(outer.reason);
      else outer.addEventListener("abort", () => controller.abort(outer.reason), { once: true });
    }
    return baseFetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
  };
}

// supabase-js turns a failed fetch into { message: "TimeoutError: ..." }.
export function isTimeoutError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.includes("TimeoutError")
  );
}
