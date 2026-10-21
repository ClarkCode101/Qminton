import { describe, expect, it } from "vitest";

import { formatCurrency, formatRelativeDate, formatTime, initials, pluralizePlayer } from "@/lib/format";

// Local times, so the test works in any timezone. "now" = Mon Oct 19 2026, 6:00 PM.
const now = new Date(2026, 9, 19, 18, 0);
const at = (...parts: [number, number, number, number, number]) => new Date(...parts).toISOString();

describe("initials", () => {
  it("takes the first letters of up to two words", () => {
    expect(initials("Ma. Clara Reyes")).toBe("MC");
    expect(initials("  ben ")).toBe("B");
  });
});

describe("formatRelativeDate", () => {
  it("uses minutes for the last hour", () => {
    expect(formatRelativeDate(at(2026, 9, 19, 17, 59), now)).toBe("1 min ago");
    expect(formatRelativeDate(at(2026, 9, 19, 17, 15), now)).toBe("45 min ago");
    expect(formatRelativeDate(now.toISOString(), now)).toBe("Just now");
  });

  it("says Today / Yesterday with the time", () => {
    const today = at(2026, 9, 19, 9, 30);
    const yesterday = at(2026, 9, 18, 21, 5);
    expect(formatRelativeDate(today, now)).toBe(`Today, ${formatTime(today)}`);
    expect(formatRelativeDate(yesterday, now)).toBe(`Yesterday, ${formatTime(yesterday)}`);
  });

  it("uses the weekday for the past week, then the date", () => {
    const lastWednesday = at(2026, 9, 14, 19, 0);
    expect(formatRelativeDate(lastWednesday, now)).toMatch(/^Wed, /);
    expect(formatRelativeDate(at(2026, 9, 1, 19, 0), now)).toBe(
      new Date(2026, 9, 1).toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
    );
  });

  it("adds the year for older years", () => {
    expect(formatRelativeDate(at(2025, 11, 30, 19, 0), now)).toContain("2025");
  });
});

describe("small formatters", () => {
  it("formats pesos and player counts", () => {
    expect(formatCurrency(1250)).toBe("₱1,250");
    expect(formatCurrency(-20)).toBe("-₱20");
    expect(pluralizePlayer(1)).toBe("1 player");
    expect(pluralizePlayer(0)).toBe("0 players");
  });
});
