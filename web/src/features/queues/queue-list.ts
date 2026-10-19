import type { QueueSummary } from "@/services/queues";

export type QueueSortMode = "latest" | "alphabetical";

export const QUEUE_SORT_OPTIONS: { id: QueueSortMode; label: string }[] = [
  { id: "latest", label: "Latest" },
  { id: "alphabetical", label: "A-Z" },
];

export function sortQueues(queues: QueueSummary[], mode: QueueSortMode): QueueSummary[] {
  return [...queues].sort((left, right) => {
    if (mode === "alphabetical") {
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    }
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

// Case-insensitive "name contains" search; blank search keeps everything.
export function filterQueuesByName(queues: QueueSummary[], searchQuery: string): QueueSummary[] {
  const query = searchQuery.trim().toLowerCase();
  return queues.filter((queue) => queue.name.toLowerCase().includes(query));
}

export function getLatestQueue(queues: QueueSummary[]): QueueSummary | null {
  return sortQueues(queues, "latest")[0] ?? null;
}
