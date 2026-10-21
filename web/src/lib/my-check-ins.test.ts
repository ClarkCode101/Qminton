import { beforeEach, describe, expect, it } from "vitest";

import { addMyCheckIn, MY_CHECK_INS_TTL_MS, readMyCheckIns, removeMyCheckIn } from "@/lib/my-check-ins";

describe("players checked in from this phone", () => {
  beforeEach(() => window.localStorage.clear());

  it("remembers name + code per link", () => {
    addMyCheckIn("abc", { name: "Ana", code: "c-ana" }, 1000);
    addMyCheckIn("abc", { name: "Ben", code: "c-ben" }, 2000);
    addMyCheckIn("other", { name: "Cy", code: "c-cy" }, 2000);

    expect(readMyCheckIns("abc", 3000)).toEqual([
      { name: "Ana", code: "c-ana" },
      { name: "Ben", code: "c-ben" },
    ]);
    expect(readMyCheckIns("other", 3000)).toEqual([{ name: "Cy", code: "c-cy" }]);
  });

  it("forgets one after leaving the queue", () => {
    addMyCheckIn("abc", { name: "Ana", code: "c-ana" });
    addMyCheckIn("abc", { name: "Ben", code: "c-ben" });

    expect(removeMyCheckIn("abc", "c-ana")).toEqual([{ name: "Ben", code: "c-ben" }]);
    removeMyCheckIn("abc", "c-ben");
    expect(window.localStorage.getItem("qminton:check-ins:abc")).toBeNull();
  });

  it("forgets them after 12 hours", () => {
    addMyCheckIn("abc", { name: "Ana", code: "c-ana" }, 0);
    addMyCheckIn("abc", { name: "Ben", code: "c-ben" }, MY_CHECK_INS_TTL_MS);

    expect(readMyCheckIns("abc", MY_CHECK_INS_TTL_MS + 1)).toEqual([{ name: "Ben", code: "c-ben" }]);
  });

  it("treats bad saved data as nothing saved", () => {
    window.localStorage.setItem("qminton:check-ins:abc", "{not json");
    expect(readMyCheckIns("abc")).toEqual([]);
    // Saved before codes existed: ignored.
    window.localStorage.setItem("qminton:check-ins:abc", JSON.stringify([{ name: "Ana", at: Date.now() }]));
    expect(readMyCheckIns("abc")).toEqual([]);
  });
});
