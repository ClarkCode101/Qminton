import { useState } from "react";
import { useParams } from "react-router";

import { NAV_TABS, type NavTab } from "@/app/nav-tabs";
import { Navbar } from "@/app/navbar";
import { FullScreenMessage } from "@/components/full-screen-message";
import { LoadError } from "@/components/load-error";
import { useQueue } from "@/features/queues/use-queues";
import { gameModeLabel } from "@/lib/format";

// Organizer view of one queue. Step 4 only has the navbar and the queue name;
// the Courts / Players / Billing tabs are ported in steps 5–10.
export function QueuePage() {
  const { queueId = "" } = useParams();
  const { data: queue, isPending, isError, refetch } = useQueue(queueId);
  const [activeTab, setActiveTab] = useState<NavTab>("courts");

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    );
  }

  // A network hiccup keeps you here with a retry (old bug #4 sent you to "/").
  if (isError) {
    return <LoadError message="Could not load this queue. Check your connection and try again." onRetry={() => void refetch()} />;
  }

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

  const tabLabel = NAV_TABS.find((tab) => tab.id === activeTab)?.label ?? "";

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Navbar queueId={queue.id} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="app-shell-safe-bottom flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_top_left,#eff6ff,#f8fbff_36%,#eef6ff)] p-4">
        <div className="max-w-md text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-500">
            {gameModeLabel(queue.game_mode)} · {tabLabel}
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">{queue.name}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            The {tabLabel} tab is being migrated to Qminton.
          </p>
        </div>
      </div>
    </div>
  );
}
