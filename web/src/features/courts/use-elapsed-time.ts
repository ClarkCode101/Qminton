import { useEffect, useState } from "react";

import { formatElapsed } from "@/features/courts/court-view";

// "12:04" since startedAt, re-rendering every second while a match is running.
export function useElapsedTime(startedAt: string | null): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return formatElapsed(startedAt, now);
}
