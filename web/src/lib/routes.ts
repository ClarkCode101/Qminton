// One place for the app's URLs, so links never get out of sync.

export function getQueuePath(queueId: string): string {
  return `/queue/${encodeURIComponent(queueId)}`;
}

export function getQueueDisplayPath(queueId: string): string {
  return `/queue/${encodeURIComponent(queueId)}/display`;
}

// Player self check-in page; the QR holds this link (a separate code, not the queue id).
export function getCheckInPath(token: string): string {
  return `/join/${encodeURIComponent(token)}`;
}

export function getCheckInUrl(token: string, origin: string = window.location.origin): string {
  return `${origin}${getCheckInPath(token)}`;
}
