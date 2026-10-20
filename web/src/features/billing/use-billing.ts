import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queueKeys } from "@/features/queues/use-queues";
import { useToast } from "@/hooks/use-toast";
import {
  addAdjustment,
  addSharedFee,
  listBillingPlayers,
  listLedger,
  recordBulkPayment,
  recordPayment,
  reverseLatestPayment,
} from "@/services/billing";
import { toUserMessage } from "@/services/errors";

// Both keys start with ["queues", queueId], so starting a match (game fee) or
// adding a player (court fee) also refreshes the Billing tab.
export const billingKeys = {
  ledger: (queueId: string) => ["queues", queueId, "ledger"] as const,
  players: (queueId: string) => ["queues", queueId, "billing-players"] as const,
};

// enabled = false while the Billing tab is closed: no downloads (the ledger
// grows all session); it loads when the tab opens.
export function useLedger(queueId: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: billingKeys.ledger(queueId), queryFn: () => listLedger(queueId), enabled });
}

export function useBillingPlayers(queueId: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: billingKeys.players(queueId), queryFn: () => listBillingPlayers(queueId), enabled });
}

const plural = (count: number) => `${count} player${count !== 1 ? "s" : ""}`;

// All billing actions. Toast messages match the old app. The calling dialog
// awaits mutateAsync, so it stays open (with the error toast) when saving fails.
export function useBillingActions(queueId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Reload in the background; the dialog closes as soon as the save worked.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queueKeys.detail(queueId) });
    void queryClient.invalidateQueries({ queryKey: queueKeys.list, exact: true });
  };

  const onError = (fallback: string) => (error: unknown) => {
    showToast(toUserMessage(error, fallback), "error");
  };

  const markPaid = useMutation({
    mutationFn: (input: Parameters<typeof recordPayment>[1]) => recordPayment(queueId, input),
    onSuccess: () => {
      refresh();
      showToast("Player marked as paid", "success");
    },
    onError: onError("Failed to mark player as paid"),
  });

  const markPaidBulk = useMutation({
    mutationFn: (input: Parameters<typeof recordBulkPayment>[1]) => recordBulkPayment(queueId, input),
    onSuccess: (_result, input) => {
      refresh();
      showToast(`Marked ${plural(input.playerIds.length)} as paid`, "success");
    },
    onError: onError("Failed to mark selected players as paid"),
  });

  const undoPayment = useMutation({
    mutationFn: (playerId: number) => reverseLatestPayment(queueId, playerId),
    onSuccess: () => {
      refresh();
      showToast("Payment reverted", "success");
    },
    onError: onError("Failed to revert payment"),
  });

  const adjust = useMutation({
    mutationFn: (input: Parameters<typeof addAdjustment>[1]) => addAdjustment(queueId, input),
    onSuccess: () => {
      refresh();
      showToast("Billing adjustment saved", "success");
    },
    onError: onError("Failed to save billing adjustment"),
  });

  const sharedFee = useMutation({
    mutationFn: (input: Parameters<typeof addSharedFee>[1]) => addSharedFee(queueId, input),
    onSuccess: (_result, input) => {
      refresh();
      showToast(`Shared fee saved for ${plural(input.playerIds.length)}`, "success");
    },
    onError: onError("Failed to save shared fee"),
  });

  return { markPaid, markPaidBulk, undoPayment, adjust, sharedFee };
}
