import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/hooks/use-toast";
import { setCheckIn, type CheckInSettings } from "@/services/check-in";
import { toUserMessage } from "@/services/errors";

// Under ["queues", id], so live updates (e.g. another device closing check-in) refresh it.
export const checkInKeys = {
  settings: (queueId: string) => ["queues", queueId, "check-in"] as const,
};

// The organizer's check-in settings (the first read creates them, closed).
export function useCheckInSettings(queueId: string) {
  return useQuery({ queryKey: checkInKeys.settings(queueId), queryFn: () => setCheckIn(queueId) });
}

// Open / close check-in, or make a new code.
export function useUpdateCheckIn(queueId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (change: { open?: boolean; newCode?: boolean }) => setCheckIn(queueId, change),
    onSuccess: (settings: CheckInSettings, change) => {
      queryClient.setQueryData(checkInKeys.settings(queueId), settings);
      if (change.newCode) showToast("New check-in code made. Old QR codes no longer work.", "success");
      else showToast(settings.is_open ? "Check-in is open" : "Check-in is closed", "success");
    },
    onError: (error) => showToast(toUserMessage(error, "Failed to update check-in"), "error"),
  });
}
