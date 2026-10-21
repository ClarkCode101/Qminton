import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CheckInPage } from "@/pages/check-in-page";
import { checkIn, leaveQueue } from "@/services/check-in";
import { cancelSignup, getSignupPage, signUp, type SignupPage } from "@/services/signups";
import { renderApp } from "@/test/render-app";

// Never talk to the real Supabase in tests.
vi.mock("@/services/check-in", () => ({ checkIn: vi.fn(), leaveQueue: vi.fn() }));
vi.mock("@/services/signups", () => ({ getSignupPage: vi.fn(), signUp: vi.fn(), cancelSignup: vi.fn() }));

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
  // A tiny fake of the server: players still in the queue, by their leave code.
  // get_signup's "mine" = the phone's codes that are still in it.
  let inQueue: Map<string, string>;
  let isOpen: boolean;

  // Block body: a function returned from beforeEach would run as cleanup.
  beforeEach(() => {
    window.localStorage.clear();
    inQueue = new Map();
    isOpen = true;
    vi.mocked(getSignupPage)
      .mockReset()
      .mockImplementation(async (_token, codes = []) => ({
        ...livePage,
        isOpen,
        mine: codes.filter((code) => inQueue.has(code)).map((code) => ({ code, name: inQueue.get(code) ?? "" })),
      }));
    vi.mocked(checkIn).mockReset();
    vi.mocked(leaveQueue).mockReset();
  });

  function joinsAs(name: string, code: string, position = 12) {
    vi.mocked(checkIn).mockImplementation(async () => {
      inQueue.set(code, name);
      return { name, position, queueId: "q1", code };
    });
  }

  async function join(name: string, skill = "Beginner") {
    fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: name } });
    fireEvent.click(screen.getByRole("radio", { name: skill }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Join" }));
    });
  }

  it("joins with a name and a skill, then shows the spot in line", async () => {
    joinsAs("Ana", "code-ana");
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
    // Watching the courts is the display's QR now, not this page (owner).
    expect(screen.queryByRole("button", { name: "View courts" })).not.toBeInTheDocument();
  });

  it("remembers on this phone who joined, so a refresh shows You're in instead of the form", async () => {
    joinsAs("Ana", "code-ana");
    renderApp(routes, "/join/abc");
    await join("Ana");
    expect(await screen.findByText("Welcome, Ana!")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("qminton:check-ins:abc") ?? "[]")).toMatchObject([{ name: "Ana", code: "code-ana" }]);

    // Open the link again (refresh): the server is asked about this phone's code.
    cleanup();
    renderApp(routes, "/join/abc");
    expect(await screen.findByText("You're in")).toBeInTheDocument();
    expect(getSignupPage).toHaveBeenLastCalledWith("abc", ["code-ana"]);
    expect(screen.getByText("✓ Ana")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument();

    // Add someone else → the form; Cancel → back to You're in.
    fireEvent.click(await screen.findByRole("button", { name: "Add someone else" }));
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("✓ Ana")).toBeInTheDocument();
  });

  it("doesn't offer Add someone else once check-in is closed (leaving still works)", async () => {
    window.localStorage.setItem("qminton:check-ins:abc", JSON.stringify([{ name: "Ana", code: "code-ana", at: Date.now() }]));
    inQueue.set("code-ana", "Ana");
    isOpen = false;
    renderApp(routes, "/join/abc");

    expect(await screen.findByText("✓ Ana")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add someone else" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave queue" })).toBeInTheDocument();
  });

  it("leaves the queue after confirming, and says if the court fee was taken off", async () => {
    window.localStorage.setItem("qminton:check-ins:abc", JSON.stringify([{ name: "Ana", code: "code-ana", at: Date.now() }]));
    inQueue.set("code-ana", "Ana");
    vi.mocked(leaveQueue).mockImplementation(async (code) => {
      inQueue.delete(code);
      return { name: "Ana", refunded: 50 };
    });
    renderApp(routes, "/join/abc");

    fireEvent.click(await screen.findByRole("button", { name: "Leave queue" }));
    // Asks first; "Stay" keeps the spot.
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(leaveQueue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Leave queue" }));
    expect(screen.getByText("Leave the queue, Ana?")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    });

    expect(leaveQueue).toHaveBeenCalledWith("code-ana");
    expect(await screen.findByText("Ana left the queue. The ₱50 court fee was taken off.")).toBeInTheDocument();
    // Nobody left from this phone: the form again, and the phone forgot the code.
    expect(await screen.findByLabelText("Your name")).toBeInTheDocument();
    expect(window.localStorage.getItem("qminton:check-ins:abc")).toBeNull();
  });

  it("shows why leaving was refused (e.g. already on a court)", async () => {
    window.localStorage.setItem("qminton:check-ins:abc", JSON.stringify([{ name: "Ana", code: "code-ana", at: Date.now() }]));
    inQueue.set("code-ana", "Ana");
    vi.mocked(leaveQueue).mockRejectedValue({ code: "P0001", message: "You are on a court right now. Please tell the organizer." });
    renderApp(routes, "/join/abc");

    fireEvent.click(await screen.findByRole("button", { name: "Leave queue" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("You are on a court right now.");
    expect(window.localStorage.getItem("qminton:check-ins:abc")).not.toBeNull();
  });

  it("drops a player the organizer removed (the server no longer lists the code)", async () => {
    window.localStorage.setItem("qminton:check-ins:abc", JSON.stringify([{ name: "Ana", code: "code-ana", at: Date.now() }]));
    renderApp(routes, "/join/abc");

    // Not in the queue any more: the form, not "You're in".
    expect(await screen.findByLabelText("Your name")).toBeInTheDocument();
    expect(screen.queryByText("✓ Ana")).not.toBeInTheDocument();
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
