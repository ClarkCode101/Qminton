import { describe, expect, it } from "vitest";

import { toUserMessage } from "@/services/errors";

describe("toUserMessage", () => {
  it("shows messages raised by our database functions", () => {
    expect(toUserMessage({ code: "P0001", message: "Queue not found" }, "fallback")).toBe("Queue not found");
  });

  it("hides technical errors behind the fallback", () => {
    expect(toUserMessage({ code: "23505", message: "duplicate key value violates…" }, "fallback")).toBe("fallback");
    expect(toUserMessage(new TypeError("Failed to fetch"), "fallback")).toBe("fallback");
    expect(toUserMessage("weird", "fallback")).toBe("fallback");
  });
});
