import { useState } from "react";
import { useParams } from "react-router";

import type { NavTab } from "@/app/nav-tabs";
import { Navbar } from "@/app/navbar";
import { ConfirmActionModal } from "@/components/confirm-action-modal";
import { FullScreenMessage } from "@/components/full-screen-message";
import { LoadError } from "@/components/load-error";
import { BillingTab } from "@/features/billing/billing-tab";
import { CourtsTab } from "@/features/courts/courts-tab";
import { ResetMatchmakingDialog } from "@/features/matchmaking/reset-matchmaking-dialog";
import {
  useActiveMatches,
  useCancelQueuedMatch,
  useFinishGame,
  useMatchHistory,
  useResetMatchmaking,
  useStartNextMatch,
} from "@/features/matchmaking/use-matchmaking";
import { AddPlayerModal } from "@/features/players/add-player-modal";
import { PlayerStatsTable } from "@/features/players/player-stats-table";
import { usePlayerActions, usePlayerBilledTotals, usePlayers } from "@/features/players/use-players";
import { useQueue, useUpdateQueueSettings } from "@/features/queues/use-queues";
import { useToast } from "@/hooks/use-toast";
import { toUserMessage } from "@/services/errors";
import type { MatchWithPlayers } from "@/services/matches";
import type { Player } from "@/services/players";

// Organizer view of one queue (ported from the old app/queue/page.tsx).
// So far: Courts tab layout + players sidebar + court count (steps 5–6),
// Players tab table, Billing setup. The rest of Billing arrives in step 10.
export function QueuePage() {
  const { queueId = "" } = useParams();
  const queueQuery = useQueue(queueId);
  const playersQuery = usePlayers(queueId);
  const billedQuery = usePlayerBilledTotals(queueId);
  const actions = usePlayerActions(queueId);
  const updateSettings = useUpdateQueueSettings(queueId);
  const matchesQuery = useActiveMatches(queueId);
  const historyQuery = useMatchHistory(queueId);
  const startMatch = useStartNextMatch(queueId);
  const cancelQueued = useCancelQueuedMatch(queueId);
  const finishGame = useFinishGame(queueId);
  const resetMatchmaking = useResetMatchmaking(queueId);
  const { showToast } = useToast();
  const [showResetDialog, setShowResetDialog] = useState(false);

  const [activeTab, setActiveTab] = useState<NavTab>("courts");
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [playerToRemove, setPlayerToRemove] = useState<Player | null>(null);
  const [matchToCancel, setMatchToCancel] = useState<MatchWithPlayers | null>(null);

  if (queueQuery.isPending || (queueQuery.data && (playersQuery.isPending || matchesQuery.isPending))) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  // A network hiccup keeps you here with a retry (old bug #4 sent you to "/").
  if (queueQuery.isError || playersQuery.isError || matchesQuery.isError) {
    return (
      <LoadError
        message="Could not load this queue. Check your connection and try again."
        onRetry={() => {
          void queueQuery.refetch();
          void playersQuery.refetch();
          void matchesQuery.refetch();
        }}
      />
    );
  }

  const queue = queueQuery.data;

  // Deleted, never existed, or belongs to another organizer (RLS hides it).
  if (!queue) {
    return (
      <FullScreenMessage
        title="Queue not found"
        message="It may have been deleted, or it belongs to another organizer."
        linkTo="/landing"
        linkLabel="Go to Landing"
      />
    );
  }

  const players = playersQuery.data ?? [];
  const matches = matchesQuery.data ?? [];

  // Finish the match the organizer sees on that court (its id guards against double taps).
  const finishCourt = (courtNo: number) => {
    const match = matches.find((item) => item.status === "started" && item.court_no === courtNo);
    if (!match || finishGame.isPending) return;
    finishGame.mutate({ courtNo, matchId: match.id });
  };

  const confirmReset = async (includePlayersOnBreak: boolean) => {
    try {
      await resetMatchmaking.mutateAsync(includePlayersOnBreak);
      setShowResetDialog(false);
    } catch {
      // Toast already shown; keep the dialog open.
    }
  };

  const confirmCancelMatch = async () => {
    if (!matchToCancel) return;
    try {
      await cancelQueued.mutateAsync(matchToCancel.id);
      setMatchToCancel(null);
    } catch {
      // Toast already shown; keep the dialog so they can retry or cancel.
    }
  };

  // Old bug #7: a failed court count change used to be an unhandled error.
  const changeCourtCount = async (courtCount: number) => {
    try {
      await updateSettings.mutateAsync({ courtCount });
      showToast("Courts updated", "success");
    } catch (error) {
      showToast(toUserMessage(error, "Failed to update courts"), "error");
    }
  };

  const saveBillingSetup = async (data: { courtFee: number; gameRate: number }) => {
    try {
      await updateSettings.mutateAsync(data);
      showToast("Billing setup saved", "success");
    } catch (error) {
      showToast(toUserMessage(error, "Failed to save billing setup"), "error");
      throw error;
    }
  };

  const confirmRemove = async () => {
    if (!playerToRemove) return;
    try {
      await actions.remove.mutateAsync(playerToRemove);
      setPlayerToRemove(null);
    } catch {
      // Toast already shown; keep the dialog so they can retry or cancel.
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {showAddPlayer && (
        <AddPlayerModal
          onAdd={async (player) => {
            await actions.add.mutateAsync(player);
            setShowAddPlayer(false);
          }}
          onBulkAdd={async (newPlayers) => {
            await actions.bulkAdd.mutateAsync(newPlayers);
            setShowAddPlayer(false);
          }}
          onClose={() => setShowAddPlayer(false)}
        />
      )}

      {playerToRemove && (
        <ConfirmActionModal
          title="Remove player?"
          message={`Remove ${playerToRemove.name} from the queue?`}
          confirmLabel="Remove Player"
          tone="danger"
          busy={actions.remove.isPending}
          onConfirm={confirmRemove}
          onClose={() => setPlayerToRemove(null)}
        />
      )}

      {matchToCancel && (
        <ConfirmActionModal
          title="Cancel queued match?"
          message="This queued match will be removed from the upcoming matches list."
          confirmLabel="Cancel Match"
          tone="danger"
          busy={cancelQueued.isPending}
          onConfirm={confirmCancelMatch}
          onClose={() => setMatchToCancel(null)}
        />
      )}

      {showResetDialog && (
        <ResetMatchmakingDialog
          busy={resetMatchmaking.isPending}
          onConfirm={confirmReset}
          onClose={() => setShowResetDialog(false)}
        />
      )}

      <Navbar queueId={queue.id} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "courts" && (
        <CourtsTab
          queue={queue}
          players={players}
          matches={matches}
          matchLog={historyQuery.data ?? { entries: [], total: 0 }}
          isStartingMatch={startMatch.isPending}
          isResetting={resetMatchmaking.isPending}
          onStartMatch={() => startMatch.mutate()}
          onFinishCourt={finishCourt}
          onShowResetMatchmaking={() => setShowResetDialog(true)}
          onCancelQueuedMatch={setMatchToCancel}
          isSavingCourtCount={updateSettings.isPending}
          onChangeCourtCount={(courtCount) => void changeCourtCount(courtCount)}
          onShowAddPlayer={() => setShowAddPlayer(true)}
          onRemovePlayer={setPlayerToRemove}
          onTogglePause={(player) => actions.togglePause.mutate(player)}
          onMoveToBottom={(player) => actions.moveToBottom.mutate(player)}
        />
      )}

      {activeTab === "players" && (
        <div className="app-shell-safe-bottom flex-1 overflow-y-auto p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-600">Player Statistics</h2>
          <PlayerStatsTable players={players} billedByPlayerId={billedQuery.data ?? new Map()} onRemove={setPlayerToRemove} />
        </div>
      )}

      {activeTab === "billing" && <BillingTab queue={queue} onSaveBillingSetup={saveBillingSetup} />}
    </div>
  );
}
