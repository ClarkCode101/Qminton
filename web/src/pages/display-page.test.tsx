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

  it("shows the courts, the next matches and a QR code", async () => {
    renderApp(routes, "/queue/q1/display");

    expect(await screen.findByRole("heading", { name: "Saturday Session" })).toBeInTheDocument();
    expect(screen.getByText("Doubles session")).toBeInTheDocument();
    expect(screen.getByText("On court 1")).toBeInTheDocument();
    expect(screen.getByText("Coming up 4")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Court 1")).toBeInTheDocument();

    const upNext = screen.getByRole("region", { name: "Up Next" });
    expect(within(upNext).getByText("Match 1")).toBeInTheDocument();
    expect(within(upNext).getByText("Eve + Fay")).toBeInTheDocument();
    expect(within(upNext).getByText("4 queued")).toBeInTheDocument();

    expect(screen.getByTitle("QR code for the live display")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Organizer View" })).toHaveAttribute("href", "/queue/q1");
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

      expect(await screen.findByText("No upcoming matches yet.")).toBeInTheDocument();
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
