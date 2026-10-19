import { useState } from "react";
import { Navigate } from "react-router";

import type { NavTab } from "@/app/nav-tabs";
import { Navbar } from "@/app/navbar";
import { LoadError } from "@/components/load-error";
import { EmptyWorkspaceTab } from "@/features/queues/empty-workspace";
import { getLatestQueue } from "@/features/queues/queue-list";
import { CreateQueueDialog } from "@/features/queues/queue-dialogs";
import { useQueueSummaries } from "@/features/queues/use-queues";
import { getQueuePath } from "@/lib/routes";

// "/": opens the most recently updated queue; with no queues yet it shows the
// empty workspace preview (same as the old app/page.tsx).
export function HomePage() {
  const { data: queues, isPending, isError, refetch } = useQueueSummaries();
  const [activeTab, setActiveTab] = useState<NavTab>("courts");
  const [showNewQueue, setShowNewQueue] = useState(false);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#eff6ff,#f8fbff_36%,#eef6ff)]">
        <p className="text-sm text-slate-400">Loading workspace...</p>
      </div>
    );
  }

  // Don't pretend there are no queues when we simply couldn't load them.
  if (isError) {
    return <LoadError message="Could not load your queues. Check your connection and try again." onRetry={() => void refetch()} />;
  }

  const latestQueue = getLatestQueue(queues);
  if (latestQueue) {
    return <Navigate to={getQueuePath(latestQueue.id)} replace />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {showNewQueue && <CreateQueueDialog onClose={() => setShowNewQueue(false)} />}

      <Navbar queueId={null} activeTab={activeTab} onTabChange={setActiveTab} />

      <EmptyWorkspaceTab tab={activeTab} onCreateQueue={() => setShowNewQueue(true)} />
    </div>
  );
}
