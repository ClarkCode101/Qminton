import { describe, expect, it } from "vitest";

import { formatElapsed, getEmptyCourts } from "@/features/courts/court-view";

describe("formatElapsed", () => {
  const start = "2026-10-15T23:58:00Z";

  it("shows minutes and zero-padded seconds since the start", () => {
    expect(formatElapsed(start, Date.parse("2026-10-15T23:58:07Z"))).toBe("0:07");
    expect(formatElapsed(start, Date.parse("2026-10-16T00:10:30Z"))).toBe("12:30");
  });

  it("works across midnight (old bug #3 used '11:58 PM' strings)", () => {
    expect(formatElapsed(start, Date.parse("2026-10-16T00:01:00Z"))).toBe("3:00");
  });

  it("handles no start, bad input and clock skew", () => {
    expect(formatElapsed(null, Date.now())).toBe("");
    expect(formatElapsed("not a date", Date.now())).toBe("--:--");
    expect(formatElapsed(start, Date.parse("2026-10-15T23:57:00Z"))).toBe("0:00");
  });
});

describe("getEmptyCourts", () => {
  it("numbers courts from 1", () => {
    expect(getEmptyCourts(2).map((court) => court.courtNo)).toEqual([1, 2]);
    expect(getEmptyCourts(2).every((court) => court.status === "available")).toBe(true);
  });
});
