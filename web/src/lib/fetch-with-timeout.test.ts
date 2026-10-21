import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchWithTimeout, isTimeoutError } from "@/lib/fetch-with-timeout";

// A fake fetch that never answers until its signal is aborted.
const hangingFetch: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives up with a TimeoutError when the server doesn't answer in time", async () => {
    vi.useFakeTimers();
    const request = fetchWithTimeout(15_000, hangingFetch)("https://example.invalid");
    const outcome = request.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);
    const error = await outcome;
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("TimeoutError");
  });

  it("passes a fast answer through", async () => {
    const ok = new Response("ok");
    const fast: typeof fetch = async () => ok;
    await expect(fetchWithTimeout(15_000, fast)("https://example.invalid")).resolves.toBe(ok);
  });

  it("still cancels when the caller cancels", async () => {
    const outer = new AbortController();
    const request = fetchWithTimeout(15_000, hangingFetch)("https://example.invalid", { signal: outer.signal });
    outer.abort(new DOMException("Cancelled", "AbortError"));
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("isTimeoutError", () => {
  it("recognizes the error supabase-js returns for a timed-out request", () => {
    expect(isTimeoutError({ message: "TimeoutError: Request timed out", code: "" })).toBe(true);
    expect(isTimeoutError({ message: "Court is not occupied", code: "P0001" })).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
  });
});
