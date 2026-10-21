import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getEmptyCourts, type CourtView } from "@/features/courts/court-view";
import { useQueueLiveUpdates } from "@/hooks/use-queue-live-updates";
import { getDisplay, type DisplayData } from "@/services/display";

export const displayKeys = {
  detail: (queueId: string) => ["display", queueId] as const,
};

// Public display data, reloaded live whenever the queue changes.
export function useDisplay(queueId: string) {
  const queryClient = useQueryClient();
  useQueueLiveUpdates(queueId, () => {
    void queryClient.invalidateQueries({ queryKey: displayKeys.detail(queueId) });
  });
  return useQuery({ queryKey: displayKeys.detail(queueId), queryFn: () => getDisplay(queueId) });
}

// Courts 1..court_count, filled in with the matches being played.
export function buildDisplayCourts(data: DisplayData): CourtView[] {
  const courts = getEmptyCourts(data.courtCount);
  for (const playing of data.courts) {
    const court = courts[playing.courtNo - 1];
    if (!court) continue;
    court.status = "occupied";
    court.startedAt = playing.startedAt;
    court.team1 = playing.team1;
    court.team2 = playing.team2;
  }
  return courts;
}
