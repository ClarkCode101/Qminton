import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QueuePage } from "@/pages/queue-page";
import { listBillingPlayers, listLedger } from "@/services/billing";
import { getQueue, type Queue } from "@/services/queues";
import { subscribeToQueueChanges, type QueueChange } from "@/services/realtime";
import { renderApp } from "@/test/render-app";

// Never talk to the real Supabase in tests.
vi.mock("@/services/queues", () => ({ getQueue: vi.fn(), listQueues: vi.fn(async () => []) }));
vi.mock("@/services/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/services/players", () => ({ listPlayers: vi.fn(async () => []) }));
vi.mock("@/services/matches", () => ({
  listActiveMatches: vi.fn(async () => []),
  listMatchHistory: vi.fn(async () => ({ entries: [], total: 0 })),
}));
vi.mock("@/services/billing", () => ({ listLedger: vi.fn(async () => []), listBillingPlayers: vi.fn(async () => []) }));
vi.mock("@/services/realtime", () => ({ subscribeToQueueChanges: vi.fn(() => () => {}) }));

const queue: Queue = {
  id: "q1",
  owner_id: "u1",
  status: "live",
  starts_at: null,
  name: "Saturday Session",
  game_mode: "doubles",
  court_fee: 0,
  game_rate: 0,
  court_count: 2,
  match_no: 0,
  version: 7,
  created_at: "2026-10-20T00:00:00Z",
  updated_at: "2026-10-20T00:00:00Z",
};

const routes = [{ path: "/queue/:queueId", element: <QueuePage /> }];

// The live-update callback the page registered.
function liveUpdate(): (change?: QueueChange) => void {
  return vi.mocked(subscribeToQueueChanges).mock.calls[0][1];
}

describe("queue page loading and live updates", () => {
  // Block body: a function returned from beforeEach would run as cleanup.
  beforeEach(() => {
    vi.mocked(getQueue).mockReset().mockResolvedValue(queue);
    vi.mocked(subscribeToQueueChanges).mockClear();
    vi.mocked(listLedger).mockClear();
    vi.mocked(listBillingPlayers).mockClear();
  });

  it("loads billing data only when its tab opens", async () => {
    renderApp(routes, "/queue/q1");
    await screen.findByRole("button", { name: "More court actions" });
    // Up Next stays on screen (empty) so the layout doesn't jump.
    expect(screen.getByRole("region", { name: "Up Next" })).toHaveTextContent("No matches waiting.");
    expect(listLedger).not.toHaveBeenCalled();
    expect(listBillingPlayers).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Billing" }));
    expect(await screen.findByText("Billing workspace")).toBeInTheDocument();
    expect(listLedger).toHaveBeenCalledTimes(1);
    expect(listBillingPlayers).toHaveBeenCalledTimes(1);

    // Only two tabs now (the Players tab was removed).
    expect(screen.queryByRole("button", { name: "Players" })).not.toBeInTheDocument();
  });

  it("skips the echo of a change it already shows, reloads for newer ones", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp(routes, "/queue/q1");
      await screen.findByRole("button", { name: "More court actions" });
      expect(getQueue).toHaveBeenCalledTimes(1);

      // Version 7 is already on screen (e.g. our own change): no reload.
      act(() => liveUpdate()({ version: 7 }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      expect(getQueue).toHaveBeenCalledTimes(1);

      // Another device saved version 8: reload.
      act(() => liveUpdate()({ version: 8 }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      expect(getQueue).toHaveBeenCalledTimes(2);

      // Reconnect (no version): always reload.
      act(() => liveUpdate()());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      expect(getQueue).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
