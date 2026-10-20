// One place for the app's URLs, so links never get out of sync.

export function getQueuePath(queueId: string): string {
  return `/queue/${encodeURIComponent(queueId)}`;
}

export function getQueueDisplayPath(queueId: string): string {
  return `/queue/${encodeURIComponent(queueId)}/display`;
}

// The full display link (for the QR code): "https://<this site>/queue/<id>/display".
export function getQueueDisplayUrl(queueId: string, origin: string = window.location.origin): string {
  return `${origin}${getQueueDisplayPath(queueId)}`;
}
