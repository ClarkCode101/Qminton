import { describe, expect, it } from "vitest";

import { newQueueFormSchema } from "@/features/queues/queue-form-schema";

const valid = { name: "Saturday Session", gameMode: "doubles", courtFee: "50", gameRate: "20" } as const;

function firstError(input: Record<string, string>) {
  const result = newQueueFormSchema.safeParse({ ...valid, ...input });
  return result.success ? null : result.error.issues[0].message;
}

describe("newQueueFormSchema", () => {
  it("trims the name and turns peso text into numbers", () => {
    expect(newQueueFormSchema.parse({ ...valid, name: "  Saturday  ", courtFee: " 50 " })).toEqual({
      name: "Saturday",
      gameMode: "doubles",
      courtFee: 50,
      gameRate: 20,
    });
  });

  it("treats empty fees as 0, like the old app", () => {
    expect(newQueueFormSchema.parse({ ...valid, courtFee: "", gameRate: "  " })).toMatchObject({
      courtFee: 0,
      gameRate: 0,
    });
  });

  it("requires a name of at most 60 characters", () => {
    expect(firstError({ name: "   " })).toBe("Please enter a queue name");
    expect(firstError({ name: "x".repeat(61) })).toBe("Queue name must be 60 characters or less");
  });

  it("rejects negative, decimal and non-number fees with readable messages (old bugs #5, #6)", () => {
    expect(firstError({ courtFee: "-5" })).toBe("Billing values cannot be negative");
    expect(firstError({ gameRate: "12.50" })).toBe("Use whole pesos only (no centavos)");
    expect(firstError({ courtFee: "abc" })).toBe("Enter a number");
    expect(firstError({ courtFee: "100001" })).toBe("Amount is too large");
  });
});
