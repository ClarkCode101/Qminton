import { describe, expect, it } from "vitest";

import { filterQueuesByName, getBusiestQueue, getLatestQueue, sortQueues } from "@/features/queues/queue-list";
import type { QueueSummary } from "@/services/queues";

function makeQueue(name: string, updatedAt: string, playerCount = 0): QueueSummary {
  return {
    id: name,
    name,
    gameMode: "doubles",
    courtFee: 0,
    gameRate: 0,
    courtCount: 2,
    playerCount,
    totalBilled: 0,
    totalCollected: 0,
    createdAt: updatedAt,
    updatedAt,
  };
}

const queues = [
  makeQueue("bravo", "2026-10-10T10:00:00Z", 8),
  makeQueue("Alpha", "2026-10-12T10:00:00Z", 8),
  makeQueue("charlie", "2026-10-11T10:00:00Z", 3),
];

const names = (list: QueueSummary[]) => list.map((queue) => queue.name);

describe("queue list helpers", () => {
  it("sorts by latest update or A-Z (ignoring case)", () => {
    expect(names(sortQueues(queues, "latest"))).toEqual(["Alpha", "charlie", "bravo"]);
    expect(names(sortQueues(queues, "alphabetical"))).toEqual(["Alpha", "bravo", "charlie"]);
  });

  it("does not change the original list", () => {
    sortQueues(queues, "alphabetical");
    expect(names(queues)).toEqual(["bravo", "Alpha", "charlie"]);
  });

  it("filters by name, case-insensitive, blank search keeps all", () => {
    expect(names(filterQueuesByName(queues, " AL "))).toEqual(["Alpha"]);
    expect(filterQueuesByName(queues, "   ")).toHaveLength(3);
  });

  it("finds the latest and the busiest queue (ties go to the latest)", () => {
    expect(getLatestQueue(queues)?.name).toBe("Alpha");
    expect(getBusiestQueue(queues)?.name).toBe("Alpha");
    expect(getLatestQueue([])).toBeNull();
  });
});
