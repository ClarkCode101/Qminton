import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CheckInPage } from "@/pages/check-in-page";
import { checkIn } from "@/services/check-in";
import { getDisplay, type DisplayData } from "@/services/display";
import { cancelSignup, getSignupPage, signUp, type SignupPage } from "@/services/signups";
import { renderApp } from "@/test/render-app";

// Never talk to the real Supabase in tests.
vi.mock("@/services/check-in", () => ({ checkIn: vi.fn() }));
vi.mock("@/services/signups", () => ({ getSignupPage: vi.fn(), signUp: vi.fn(), cancelSignup: vi.fn() }));
vi.mock("@/services/display", () => ({ getDisplay: vi.fn() }));

const display: DisplayData = {
  name: "Saturday Session",
  gameMode: "doubles",
  courtCount: 2,
  courts: [
    {
      courtNo: 1,
      startedAt: "2026-10-21T10:00:00Z",
      team1: [
        { id: 1, name: "Ben" },
        { id: 2, name: "Carl" },
      ],
      team2: [
        { id: 3, name: "Dan" },
        { id: 4, name: "Eli" },
      ],
    },
  ],
  upNext: [
    {
      position: 1,
      team1: [
        { id: 5, name: "Ana" },
        { id: 6, name: "Faye" },
      ],
      team2: [
        { id: 7, name: "Gil" },
        { id: 8, name: "Hans" },
      ],
    },
  ],
  queuedCount: 3,
};

const routes = [{ path: "/join/:token", element: <CheckInPage /> }];
const livePage: SignupPage = {
  queueId: "q1",
  queueName: "Saturday Session",
  gameMode: "doubles",
  status: "live",
  startsAt: null,
  courtFee: 50,
  gameRate: 20,
  isOpen: true,
  going: [],
  mine: [],
};
const plannedPage: SignupPage = {
  ...livePage,
  status: "planned",
  startsAt: "2026-10-25T11:00:00Z",
  going: ["Ana", "Ben"],
};

describe("player self check-in page (live session)", () => {
  // Block body: a function returned from beforeEach would run as cleanup.
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(getSignupPage).mockReset().mockResolvedValue(livePage);
    vi.mocked(getDisplay).mockReset().mockResolvedValue(display);
    vi.mocked(checkIn).mockReset();
  });

  it("shows the courts only after tapping View courts, and Join the queue goes back", async () => {
    renderApp(routes, "/join/abc");

    // Not shown right away.
    expect(await screen.findByLabelText("Your name")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Courts" })).not.toBeInTheDocument();
    expect(getDisplay).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "View courts" }));
    const courts = await screen.findByRole("region", { name: "Courts" });
    expect(getDisplay).toHaveBeenCalledWith("q1");
    expect(within(courts).getByText("Court 1")).toBeInTheDocument();
    expect(within(courts).getByText("Ben")).toBeInTheDocument();
    expect(within(courts).getByText("Court 2")).toBeInTheDocument();
    expect(within(courts).getByText("Available")).toBeInTheDocument(); // court 2 = free
    expect(within(courts).getByText("#1")).toBeInTheDocument();
    expect(within(courts).getByText("+2 more waiting")).toBeInTheDocument();
    // Players only: no way to the organizer screen.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Join the queue" }));
    expect(await screen.findByLabelText("Your name")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Courts" })).not.toBeInTheDocument();
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
    // Their name is bold on the courts list (here: in Up Next).
    fireEvent.click(screen.getByRole("button", { name: "View courts" }));
    const courts = await screen.findByRole("region", { name: "Courts" });
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(within(courts).getByText("Ana")).toHaveClass("font-bold");
    expect(within(courts).getByText("Faye")).not.toHaveClass("font-bold");
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
    vi.mocked(getSignupPage).mockResolvedValue({ ...livePage, isOpen: false });
    renderApp(routes, "/join/abc");

    expect(await screen.findByText("Check-in is closed")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument();
    // The courts are still there to watch.
    fireEvent.click(screen.getByRole("button", { name: "View courts" }));
    expect(await screen.findByRole("region", { name: "Courts" })).toBeInTheDocument();
  });

  it("says when the link is no longer valid", async () => {
    vi.mocked(getSignupPage).mockResolvedValue(null);
    renderApp(routes, "/join/old");

    expect(await screen.findByText("This link is no longer valid")).toBeInTheDocument();
  });
});

describe("sign-up page (planned session)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(getSignupPage).mockReset().mockResolvedValue(plannedPage);
    vi.mocked(getDisplay).mockReset().mockResolvedValue(display);
    vi.mocked(signUp).mockReset();
    vi.mocked(cancelSignup).mockReset();
    vi.mocked(checkIn).mockReset();
  });

  it("shows the date, fees and who is going", async () => {
    renderApp(routes, "/join/abc");

    expect(await screen.findByRole("heading", { name: "Saturday Session" })).toBeInTheDocument();
    expect(screen.getByText(/Court fee ₱50 · ₱20 per game/)).toBeInTheDocument();
    const going = screen.getByRole("list", { name: "Going" });
    expect(within(going).getByText("Ana")).toBeInTheDocument();
    expect(within(going).getByText("Ben")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Going (2)" })).toBeInTheDocument();
    // No games yet: no courts.
    expect(screen.queryByRole("region", { name: "Courts" })).not.toBeInTheDocument();
    expect(getDisplay).not.toHaveBeenCalled();
  });

  it("signs up, keeps the cancel code on this phone, and can cancel", async () => {
    vi.mocked(signUp).mockResolvedValue({ name: "Cy", position: 3, code: "code-cy" });
    renderApp(routes, "/join/abc");

    fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: "Cy" } });
    fireEvent.click(screen.getByRole("radio", { name: "Advanced" }));
    // After signing up, the page reads again with this phone's code and sees Cy as "mine".
    vi.mocked(getSignupPage).mockResolvedValue({ ...plannedPage, going: ["Ana", "Ben", "Cy"], mine: [{ code: "code-cy", name: "Cy" }] });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    });

    expect(signUp).toHaveBeenCalledWith("abc", { name: "Cy", skill: "advance" });
    expect(checkIn).not.toHaveBeenCalled();
    expect(await screen.findByText("You're in, Cy! You're #3 on the list.")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("qminton:signups:abc") ?? "[]")).toEqual([{ code: "code-cy", name: "Cy" }]);
    expect(vi.mocked(getSignupPage)).toHaveBeenLastCalledWith("abc", ["code-cy"]);

    vi.mocked(cancelSignup).mockResolvedValue();
    vi.mocked(getSignupPage).mockResolvedValue(plannedPage);
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Cancel my spot" }));
    });

    expect(cancelSignup).toHaveBeenCalledWith("abc", "code-cy");
    expect(window.localStorage.getItem("qminton:signups:abc")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel my spot" })).not.toBeInTheDocument();
  });

  it("only shows a cancel button for spots made on this phone", async () => {
    window.localStorage.setItem("qminton:signups:abc", JSON.stringify([{ code: "code-ben", name: "Ben" }]));
    vi.mocked(getSignupPage).mockResolvedValue({ ...plannedPage, mine: [{ code: "code-ben", name: "Ben" }] });
    renderApp(routes, "/join/abc");

    expect(await screen.findByText("✓ Ben")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Cancel/ })).toHaveLength(1);
    expect(vi.mocked(getSignupPage)).toHaveBeenCalledWith("abc", ["code-ben"]);
    // They can still sign up a friend.
    expect(screen.getByText("Sign up someone else")).toBeInTheDocument();
  });

  it("says when sign-ups are closed", async () => {
    vi.mocked(getSignupPage).mockResolvedValue({ ...plannedPage, isOpen: false });
    renderApp(routes, "/join/abc");

    expect(await screen.findByText("Sign-ups are closed. Please ask the organizer.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Going" })).toBeInTheDocument();
  });
});
