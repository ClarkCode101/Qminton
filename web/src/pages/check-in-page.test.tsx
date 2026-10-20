import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CheckInPage } from "@/pages/check-in-page";
import { checkIn, getCheckIn } from "@/services/check-in";
import { renderApp } from "@/test/render-app";

// Never talk to the real Supabase in tests.
vi.mock("@/services/check-in", () => ({ getCheckIn: vi.fn(), checkIn: vi.fn() }));

const routes = [{ path: "/join/:token", element: <CheckInPage /> }];
const openInfo = { queueId: "q1", queueName: "Saturday Session", gameMode: "doubles" as const, isOpen: true };

describe("player self check-in page", () => {
  // Block body: a function returned from beforeEach would run as cleanup.
  beforeEach(() => {
    vi.mocked(getCheckIn).mockReset().mockResolvedValue(openInfo);
    vi.mocked(checkIn).mockReset();
  });

  it("joins with a name and a skill, then shows the spot in line", async () => {
    vi.mocked(checkIn).mockResolvedValue({ name: "Ana", position: 12, queueId: "q1" });
    renderApp(routes, "/join/abc");

    expect(await screen.findByRole("heading", { name: "Saturday Session" })).toBeInTheDocument();
    const join = screen.getByRole("button", { name: "Join" });
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "  Ana " } });
    // A skill must be picked on purpose.
    expect(join).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Intermediate" }));
    await act(async () => {
      fireEvent.click(join);
    });

    expect(checkIn).toHaveBeenCalledWith("abc", { name: "Ana", skill: "intermediate" });
    expect(await screen.findByText("Welcome, Ana!")).toBeInTheDocument();
    expect(screen.getByText("#12")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Watch the courts" })).toHaveAttribute("href", "/queue/q1/display");
  });

  it("shows the database message, e.g. a name already in the queue", async () => {
    vi.mocked(checkIn).mockRejectedValue({
      code: "P0001",
      message: "That name is already in the queue. Add your last name or a nickname.",
    });
    renderApp(routes, "/join/abc");

    fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: "Juan" } });
    fireEvent.click(screen.getByRole("radio", { name: "Beginner" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Join" }));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("That name is already in the queue.");
  });

  it("says when check-in is closed", async () => {
    vi.mocked(getCheckIn).mockResolvedValue({ ...openInfo, isOpen: false });
    renderApp(routes, "/join/abc");

    expect(await screen.findByText("Check-in is closed")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument();
  });

  it("says when the code is no longer valid", async () => {
    vi.mocked(getCheckIn).mockResolvedValue(null);
    renderApp(routes, "/join/old");

    expect(await screen.findByText("This QR code is no longer valid")).toBeInTheDocument();
  });
});
