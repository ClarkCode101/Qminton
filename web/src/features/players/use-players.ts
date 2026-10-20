import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queueKeys } from "@/features/queues/use-queues";
import { useToast } from "@/hooks/use-toast";
import { toUserMessage } from "@/services/errors";
import {
  bulkAddPlayers,
  listPlayerBilledTotals,
  listPlayers,
  movePlayerToBottom,
  removePlayer,
  setPlayerPaused,
  type NewPlayer,
  type Player,
} from "@/services/players";

export const playerKeys = {
  list: (queueId: string) => ["queues", queueId, "players"] as const,
  billed: (queueId: string) => ["queues", queueId, "players", "billed"] as const,
};

export function usePlayers(queueId: string) {
  return useQuery({ queryKey: playerKeys.list(queueId), queryFn: () => listPlayers(queueId) });
}

// Only needed by the Players tab table (enabled = false on the other tabs).
export function usePlayerBilledTotals(queueId: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: playerKeys.billed(queueId), queryFn: () => listPlayerBilledTotals(queueId), enabled });
}

// All player actions for one queue. After any change, the players list, the
// billed totals and the landing page counts are reloaded in the background
// (the result shows right away, without waiting for the reload). Messages
// match the old app; errors show the database's readable message.
export function usePlayerActions(queueId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: playerKeys.list(queueId) });
    // The queue row too: its new version lets the live update skip this change's echo.
    void queryClient.invalidateQueries({ queryKey: queueKeys.detail(queueId), exact: true });
    void queryClient.invalidateQueries({ queryKey: queueKeys.list, exact: true });
  };

  const onError = (fallback: string) => (error: unknown) => {
    showToast(toUserMessage(error, fallback), "error");
  };

  const bulkAdd = useMutation({
    mutationFn: (players: NewPlayer[]) => bulkAddPlayers(queueId, players),
    onSuccess: (added, requested) => {
      refresh();
      const skipped = requested.length - added.length;
      showToast(
        `Added ${added.length} player${added.length !== 1 ? "s" : ""}` +
          (skipped > 0 ? `\n${skipped} already in the queue (skipped)` : ""),
        "success",
      );
    },
    onError: onError("Failed to add players"),
  });

  const remove = useMutation({
    mutationFn: (player: Player) => removePlayer(queueId, player.id),
    onSuccess: refresh,
    onError: onError("Failed to remove player"),
  });

  const togglePause = useMutation({
    mutationFn: (player: Player) => setPlayerPaused(queueId, player.id, !player.is_paused),
    onSuccess: (updated, player) => {
      // Show the new status at once, so a second tap acts on the right state.
      if (updated) {
        queryClient.setQueryData<Player[]>(playerKeys.list(queueId), (list) =>
          list?.map((item) => (item.id === updated.id ? updated : item)),
        );
      }
      refresh();
      showToast(`${player.name} ${player.is_paused ? "resumed" : "paused"}`, "success");
    },
    onError: onError("Failed to update player status"),
  });

  const moveToBottom = useMutation({
    mutationFn: (player: Player) => movePlayerToBottom(queueId, player.id),
    onSuccess: () => {
      refresh();
      showToast("Player moved to bottom", "success");
    },
    onError: onError("Failed to move player"),
  });

  return { bulkAdd, remove, togglePause, moveToBottom };
}
