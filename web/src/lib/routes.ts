// One place for the app's URLs, so links never get out of sync.

export function getQueuePath(queueId: string): string {
  return `/queue/${encodeURIComponent(queueId)}`;
}

export function getQueueDisplayPath(queueId: string): string {
  return `/queue/${encodeURIComponent(queueId)}/display`;
}
