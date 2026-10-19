import { useState } from "react";
import { useParams } from "react-router";

import type { NavTab } from "@/app/nav-tabs";
import { Navbar } from "@/app/navbar";
import { ConfirmActionModal } from "@/components/confirm-action-modal";
import { FullScreenMessage } from "@/components/full-screen-message";
import { LoadError } from "@/components/load-error";
import { CourtsTab } from "@/features/courts/courts-tab";
import { AddPlayerModal } from "@/features/players/add-player-modal";
import { PlayerStatsTable } from "@/features/players/player-stats-table";
import { usePlayerActions, usePlayerBilledTotals, usePlayers } from "@/features/players/use-players";
import { useQueue } from "@/features/queues/use-queues";
import type { Player } from "@/services/players";

// Organizer view of one queue (ported from the old app/queue/page.tsx).
// Step 5: Courts tab layout + live players sidebar, Players tab table.
// Billing arrives in step 10.
export function QueuePage() {
  const { queueId = "" } = useParams();
  const queueQuery = useQueue(queueId);
  const playersQuery = usePlayers(queueId);
  const billedQuery = usePlayerBilledTotals(queueId);
  const actions = usePlayerActions(queueId);

  const [activeTab, setActiveTab] = useState<NavTab>("courts");
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [playerToRemove, setPlayerToRemove] = useState<Player | null>(null);

  if (queueQuery.isPending || (queueQuery.data && playersQuery.isPending)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  // A network hiccup keeps you here with a retry (old bug #4 sent you to "/").
  if (queueQuery.isError || playersQuery.isError) {
    return (
      <LoadError
        message="Could not load this queue. Check your connection and try again."
        onRetry={() => {
          void queueQuery.refetch();
          void playersQuery.refetch();
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

      <Navbar queueId={queue.id} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "courts" && (
        <CourtsTab
          queue={queue}
          players={players}
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

      {activeTab === "billing" && (
        <div className="app-shell-safe-bottom flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_top_left,#eff6ff,#f8fbff_36%,#eef6ff)] p-4">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">{queue.name}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">The Billing tab is being migrated to Qminton.</p>
          </div>
        </div>
      )}
    </div>
  );
}
