import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QueuePage } from "@/pages/queue-page";
import { setCheckIn } from "@/services/check-in";
import { getQueue, type Queue } from "@/services/queues";
import { addSignups, listSignups, removeSignup, setQueuePlan, startSession, type Signup } from "@/services/signups";
import { renderApp } from "@/test/render-app";

// Never talk to the real Supabase in tests.
vi.mock("@/services/queues", () => ({ getQueue: vi.fn(), listQueues: vi.fn(async () => []) }));
vi.mock("@/services/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/services/players", () => ({
  listPlayers: vi.fn(async () => []),
  listPlayerBilledTotals: vi.fn(async () => new Map()),
}));
vi.mock("@/services/matches", () => ({
  listActiveMatches: vi.fn(async () => []),
  listMatchHistory: vi.fn(async () => ({ entries: [], total: 0 })),
}));
vi.mock("@/services/billing", () => ({ listLedger: vi.fn(async () => []), listBillingPlayers: vi.fn(async () => []) }));
vi.mock("@/services/check-in", () => ({ setCheckIn: vi.fn() }));
vi.mock("@/services/signups", () => ({
  addSignups: vi.fn(),
  listSignups: vi.fn(),
  removeSignup: vi.fn(),
  setQueuePlan: vi.fn(),
  startSession: vi.fn(),
}));

const planned: Queue = {
  id: "q1",
  owner_id: "u1",
  status: "planned",
  starts_at: "2026-10-25T11:00:00Z",
  name: "Saturday Open Play",
  game_mode: "doubles",
  court_fee: 50,
  game_rate: 20,
  court_count: 2,
  match_no: 0,
  version: 3,
  created_at: "2026-10-20T00:00:00Z",
  updated_at: "2026-10-20T00:00:00Z",
};

function makeSignup(id: number, name: string): Signup {
  return {
    id,
    queue_id: "q1",
    name,
    skill: "intermediate",
    status: "going",
    cancel_code_hash: "x",
    player_id: null,
    created_at: "2026-10-20T00:00:00Z",
    updated_at: "2026-10-20T00:00:00Z",
  };
}

const routes = [{ path: "/queue/:queueId", element: <QueuePage /> }];

describe("planned session (organizer)", () => {
  beforeEach(() => {
    vi.mocked(getQueue).mockReset().mockResolvedValue(planned);
    vi.mocked(listSignups).mockReset().mockResolvedValue([makeSignup(1, "Ana"), makeSignup(2, "Ben"), makeSignup(3, "Cy")]);
    vi.mocked(setCheckIn).mockReset().mockResolvedValue({ queue_id: "q1", token: "tok-123", is_open: true, updated_at: "" });
    vi.mocked(removeSignup).mockReset();
    vi.mocked(startSession).mockReset();
    vi.mocked(setQueuePlan).mockReset();
  });

  it("shows the sign-up list and the link to share instead of the courts", async () => {
    renderApp(routes, "/queue/q1");

    expect(await screen.findByText("Planned session")).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Sign-up list" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "Going (3)" })).toBeInTheDocument();
    expect(await screen.findByText("Sign-ups open")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy invite" })).toBeInTheDocument();
    expect(screen.getByTitle("QR code for sign-up")).toBeInTheDocument();
    // Skill shows without the time, and Remove is a small ✕.
    expect(within(list).getAllByText("Intermediate")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Remove Ben" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start Next Match|Need/ })).not.toBeInTheDocument();
  });

  it("removes someone after confirming", async () => {
    vi.mocked(removeSignup).mockResolvedValue();
    renderApp(routes, "/queue/q1");

    fireEvent.click(await screen.findByRole("button", { name: "Remove Ben" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove" }));
    });

    expect(removeSignup).toHaveBeenCalledWith("q1", 2);
    expect(await screen.findByText("Ben removed from the list")).toBeInTheDocument();
  });

  it("lets the organizer add people to the list (repeats flagged, no QR tab)", async () => {
    vi.mocked(addSignups).mockResolvedValue({ added: 1, skipped: 0 });
    renderApp(routes, "/queue/q1");

    await screen.findByRole("list", { name: "Sign-up list" });
    fireEvent.click(screen.getByRole("button", { name: "+ Add people" }));
    const dialog = screen.getByRole("dialog", { name: "Add to the list" });
    expect(within(dialog).queryByRole("tab", { name: "QR check-in" })).not.toBeInTheDocument();
    // A pasted list: "ben" is already going (as Ben), so it is flagged and blocks adding until removed.
    fireEvent.paste(within(dialog).getByLabelText("Player name"), {
      clipboardData: { getData: () => "ben\nDina" },
    });
    expect(within(dialog).getByText("Already on the list")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Add 1 player" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove it" }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Add 1 player" }));
    });

    expect(addSignups).toHaveBeenCalledWith("q1", [{ name: "Dina", skill: "beginner" }]);
    expect(await screen.findByText("Added 1 to the list")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Add to the list" })).not.toBeInTheDocument();
  });

  it("starts the session with only the people who came", async () => {
    vi.mocked(startSession).mockResolvedValue({ added: 2, noShow: 1 });
    renderApp(routes, "/queue/q1");

    // The button waits for the list to load.
    await screen.findByRole("list", { name: "Sign-up list" });
    fireEvent.click(screen.getByRole("button", { name: "Start session" }));
    const dialog = screen.getByRole("dialog", { name: "Who came?" });
    // Everyone is ticked at first; Ben didn't come.
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Ben/ }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Start with 2 players" }));
    });

    expect(startSession).toHaveBeenCalledWith("q1", [1, 3]);
    expect(await screen.findByText("Session started: 2 players added, 1 didn't come")).toBeInTheDocument();
  });
});
