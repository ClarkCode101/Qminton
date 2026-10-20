import { useEffect, useRef } from "react";

import { subscribeToQueueChanges } from "@/services/realtime";

// One busy moment (e.g. Finish Game starts the next match too) can send a few
// messages in a row; wait this long so they cause a single reload.
const DEBOUNCE_MS = 300;
// Backup in case a live message is ever missed (the old app reloaded every 10 s).
const BACKUP_REFRESH_MS = 60_000;

// Calls onChange whenever the queue changes on any device.
export function useQueueLiveUpdates(queueId: string, onChange: () => void) {
  // Always call the latest onChange without resubscribing on every render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!queueId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleReload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current(), DEBOUNCE_MS);
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
