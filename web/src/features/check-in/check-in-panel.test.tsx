import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CheckInPanel } from "@/features/check-in/check-in-panel";
import { setCheckIn, type CheckInSettings } from "@/services/check-in";
import { renderApp } from "@/test/render-app";

vi.mock("@/services/check-in", () => ({ setCheckIn: vi.fn() }));

const closed: CheckInSettings = { queue_id: "q1", token: "tok-1", is_open: false, updated_at: "2026-10-20T00:00:00Z" };

describe("QR check-in panel", () => {
  // Block body: a function returned from beforeEach would run as cleanup.
  beforeEach(() => {
    vi.mocked(setCheckIn).mockReset().mockResolvedValue(closed);
  });

  function show() {
    renderApp([{ path: "/", element: <CheckInPanel queueId="q1" queueName="Saturday" /> }], "/");
  }

  // The link isn't printed any more; "Copy link" puts it on the clipboard.
  async function copiedLink() {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    });
    return writeText.mock.calls[0]?.[0];
  }

  it("shows the QR for the check-in code (not the queue id) and opens check-in", async () => {
    show();

    expect(await screen.findByText("Check-in is closed")).toBeInTheDocument();
    expect(screen.getByTitle("QR code for player check-in")).toBeInTheDocument();
    expect(await copiedLink()).toBe(`${window.location.origin}/join/tok-1`);

    vi.mocked(setCheckIn).mockResolvedValue({ ...closed, is_open: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open check-in" }));
    });
    expect(setCheckIn).toHaveBeenLastCalledWith("q1", { open: true });
    // Status flips (the toast says it too).
    expect(await screen.findByRole("button", { name: "Close check-in" })).toBeInTheDocument();
  });

  it("makes a new code after confirming", async () => {
    show();

    fireEvent.click(await screen.findByRole("button", { name: "New code" }));
    vi.mocked(setCheckIn).mockResolvedValue({ ...closed, token: "tok-2" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Make New Code" }));
    });

    expect(setCheckIn).toHaveBeenLastCalledWith("q1", { newCode: true });
    await screen.findByRole("button", { name: "New code" });
    expect(await copiedLink()).toBe(`${window.location.origin}/join/tok-2`);
  });
});
