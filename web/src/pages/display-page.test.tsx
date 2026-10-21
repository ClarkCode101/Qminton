import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DisplayPage } from "@/pages/display-page";
import { getDisplay, type DisplayData } from "@/services/display";
import { subscribeToQueueChanges } from "@/services/realtime";
import { renderApp } from "@/test/render-app";

// Never talk to the real Supabase in tests.
vi.mock("@/services/display", () => ({ getDisplay: vi.fn() }));
vi.mock("@/services/realtime", () => ({ subscribeToQueueChanges: vi.fn(() => () => {}) }));

const display: DisplayData = {
  name: "Saturday Session",
  gameMode: "doubles",
  courtCount: 2,
  courts: [
    {
      courtNo: 2,
      startedAt: new Date().toISOString(),
      team1: [
        { id: 1, name: "Ana" },
        { id: 2, name: "Ben" },
      ],
      team2: [
        { id: 3, name: "Cy" },
        { id: 4, name: "Di" },
      ],
    },
  ],
  upNext: [
    {
      position: 1,
      team1: [
        { id: 5, name: "Eve" },
        { id: 6, name: "Fay" },
      ],
      team2: [
        { id: 7, name: "Gus" },
        { id: 8, name: "Hal" },
      ],
    },
  ],
  queuedCount: 4,
};

const routes = [{ path: "/queue/:queueId/display", element: <DisplayPage /> }];

describe("public display", () => {
  // Block body: a function returned from beforeEach would run as cleanup.
  beforeEach(() => {
    vi.mocked(getDisplay).mockReset().mockResolvedValue(display);
    vi.mocked(subscribeToQueueChanges).mockClear();
  });

  it("shows the courts and the next matches", async () => {
    renderApp(routes, "/queue/q1/display");

    expect(await screen.findByRole("heading", { name: "Saturday Session" })).toBeInTheDocument();
    expect(screen.getByText("Doubles")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();

    // Every court, playing or free.
    const court2 = screen.getByRole("region", { name: "Court 2" });
    expect(within(court2).getByText("Ana")).toBeInTheDocument();
    expect(within(court2).getByText("Di")).toBeInTheDocument();
    expect(within(court2).getByLabelText(/Playing for/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Court 1" })).getByText("Available")).toBeInTheDocument();

    const upNext = screen.getByRole("region", { name: "Up Next" });
    expect(within(upNext).getByText("Eve + Fay")).toBeInTheDocument();
    expect(within(upNext).getByText("Gus + Hal")).toBeInTheDocument();
    expect(within(upNext).getByText("+3 more")).toBeInTheDocument();

    // The QR is in the organizer's More menu, not on the display (owner).
    expect(screen.queryByTitle("QR code for the live display")).not.toBeInTheDocument();
    // Players look at this screen: no way to the organizer screen (owner).
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("reloads when the queue changes on another device", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp(routes, "/queue/q1/display");
      await screen.findByText("Ana");
      expect(subscribeToQueueChanges).toHaveBeenCalledWith("q1", expect.any(Function));

      vi.mocked(getDisplay).mockResolvedValue({ ...display, courts: [], queuedCount: 0, upNext: [] });
      const onChange = vi.mocked(subscribeToQueueChanges).mock.calls[0][1];
      // A burst of messages = one reload.
      act(() => {
        onChange();
        onChange();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });

      expect(await screen.findByText("No matches waiting")).toBeInTheDocument();
      expect(getDisplay).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says when the queue doesn't exist", async () => {
    vi.mocked(getDisplay).mockResolvedValue(null);
    renderApp(routes, "/queue/nope/display");
    expect(await screen.findByText("Queue not found")).toBeInTheDocument();
  });

  it("stays on the page with a retry when loading fails (old bug #4)", async () => {
    vi.mocked(getDisplay).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(display);
    renderApp(routes, "/queue/q1/display");

    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByText("Saturday Session")).toBeInTheDocument();
  });
});
