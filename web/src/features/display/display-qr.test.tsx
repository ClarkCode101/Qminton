import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DisplayQrDialog } from "@/features/display/display-qr";
import { getQueueDisplayUrl } from "@/lib/routes";
import { renderApp } from "@/test/render-app";

describe("display QR", () => {
  it("builds the full display link", () => {
    expect(getQueueDisplayUrl("abc", "https://qminton.pages.dev")).toBe("https://qminton.pages.dev/queue/abc/display");
  });

  it("shows the QR and link, and copies the link", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderApp([{ path: "/", element: <DisplayQrDialog queueId="q1" queueName="Saturday" onClose={() => {}} /> }], "/");

    const url = `${window.location.origin}/queue/q1/display`;
    expect(screen.getByRole("dialog", { name: "Scan to follow the courts" })).toBeInTheDocument();
    expect(screen.getByTitle("QR code for the live display")).toBeInTheDocument();
    expect(screen.getByText(url)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open display" })).toHaveAttribute("href", "/queue/q1/display");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    });
    expect(writeText).toHaveBeenCalledWith(url);
    expect(await screen.findByText("Display link copied")).toBeInTheDocument();
  });
});
