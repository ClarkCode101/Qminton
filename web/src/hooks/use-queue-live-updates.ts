import { useEffect, useRef } from "react";

import { subscribeToQueueChanges, type QueueChange } from "@/services/realtime";

// One busy moment (e.g. Finish Game starts the next match too) can send a few
// messages in a row; wait this long so they cause a single reload.
const DEBOUNCE_MS = 300;
// Backup in case a live message is ever missed (the old app reloaded every 10 s).
const BACKUP_REFRESH_MS = 60_000;

// Calls onChange whenever the queue changes on any device.
// `latestVersion` is the newest version seen in the messages (undefined after a
// reconnect or for the backup refresh), so a screen that already shows that
// version can skip the reload (e.g. the echo of its own change).
export function useQueueLiveUpdates(queueId: string, onChange: (latestVersion?: number) => void) {
  // Always call the latest onChange without resubscribing on every render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!queueId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Messages since the last reload: the highest version, or "must reload"
    // when one had no version (reconnect, deleted queue).
    let pending: { version?: number } | null = null;

    const scheduleReload = (change?: QueueChange) => {
      const version = change?.deleted ? undefined : change?.version;
      if (!pending) pending = { version };
      else if (pending.version !== undefined) {
        pending = { version: version === undefined ? undefined : Math.max(pending.version, version) };
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        const latest = pending?.version;
        pending = null;
        onChangeRef.current(latest);
      }, DEBOUNCE_MS);
    };

    const unsubscribe = subscribeToQueueChanges(queueId, scheduleReload);
    const backup = setInterval(() => onChangeRef.current(), BACKUP_REFRESH_MS);
    return () => {
      unsubscribe();
      clearTimeout(timer);
      clearInterval(backup);
    };
  }, [queueId]);
}
