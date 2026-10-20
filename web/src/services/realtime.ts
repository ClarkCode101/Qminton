import { supabase } from "@/services/supabase";

// What a "queue_changed" message says: the queue's new version, or that it was deleted.
export interface QueueChange {
  version?: number;
  deleted?: boolean;
}

// Live updates (replaces the old 10-second polling + BroadcastChannel).
//
// Every change to a queue bumps its version; a database trigger then sends a
// tiny "queue_changed" message on the private channel "queue:<id>" (see the
// step 11 migration). The message has no queue data in it: listeners reload.
//
// onChange is also called (without a change) when the channel reconnects, so
// anything that changed while the connection was down is picked up too.
export function subscribeToQueueChanges(queueId: string, onChange: (change?: QueueChange) => void): () => void {
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let stopped = false;
  let connectedBefore = false;

  void (async () => {
    // Private channels check who is listening: use the logged-in user's token,
    // or the publishable key for visitors on the public display.
    await supabase.realtime.setAuth();
    if (stopped) return;

    channel = supabase
      .channel(`queue:${queueId}`, { config: { private: true } })
      .on("broadcast", { event: "queue_changed" }, (message) => onChange(message.payload as QueueChange))
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        // The first connect happens right after the page loaded its data.
        if (connectedBefore) onChange();
        connectedBefore = true;
      });
  })();

  return () => {
    stopped = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
