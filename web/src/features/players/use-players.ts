import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queueKeys } from "@/features/queues/use-queues";
import { useToast } from "@/hooks/use-toast";
import { toUserMessage } from "@/services/errors";
import {
  addPlayer,
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

export function usePlayerBilledTotals(queueId: string) {
  return useQuery({ queryKey: playerKeys.billed(queueId), queryFn: () => listPlayerBilledTotals(queueId) });
}

// All player actions for one queue. After any change, the players list, the
// billed totals and the landing page counts are reloaded. Messages match the
// old app; errors show the database's readable message.
export function usePlayerActions(queueId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: playerKeys.list(queueId) }),
      queryClient.invalidateQueries({ queryKey: queueKeys.list, exact: true }),
    ]);

  const onError = (fallback: string) => (error: unknown) => {
    showToast(toUserMessage(error, fallback), "error");
  };

  const add = useMutation({
    mutationFn: (player: NewPlayer) => addPlayer(queueId, player),
    onSuccess: refresh,
    onError: onError("Failed to add player"),
  });

  const bulkAdd = useMutation({
    mutationFn: (players: NewPlayer[]) => bulkAddPlayers(queueId, players),
    onSuccess: async (added, requested) => {
      await refresh();
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
    onSuccess: async (_result, player) => {
      await refresh();
      showToast(`${player.name} ${player.is_paused ? "resumed" : "paused"}`, "success");
    },
    onError: onError("Failed to update player status"),
  });

  const moveToBottom = useMutation({
    mutationFn: (player: Player) => movePlayerToBottom(queueId, player.id),
    onSuccess: async () => {
      await refresh();
      showToast("Player moved to bottom", "success");
    },
    onError: onError("Failed to move player"),
  });

  return { add, bulkAdd, remove, togglePause, moveToBottom };
}
