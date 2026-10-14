import type { Session } from "@supabase/supabase-js";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { describe, expect, it } from "vitest";

import { AuthContext, type AuthState } from "@/features/auth/auth-context";
import { RequireAuth } from "@/features/auth/require-auth";

function ShowLocation() {
  const location = useLocation();
  return <p>login page at {location.pathname + location.search}</p>;
}

function renderAt(path: string, auth: AuthState) {
  const router = createMemoryRouter(
    [
      { path: "/login", element: <ShowLocation /> },
      {
        element: <RequireAuth />,
        children: [{ path: "/queue/:queueId", element: <p>organizer view</p> }],
      },
    ],
    { initialEntries: [path] },
  );

  render(
    <AuthContext.Provider value={auth}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  );
}

const fakeSession = { user: { email: "juan@example.com" } } as Session;

describe("RequireAuth", () => {
  it("shows a loading screen while the saved login is being checked", () => {
    renderAt("/queue/abc", { session: null, isLoading: true });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("sends logged-out visitors to /login and remembers the page", () => {
    renderAt("/queue/abc", { session: null, isLoading: false });
    expect(screen.getByText("login page at /login?next=%2Fqueue%2Fabc")).toBeInTheDocument();
  });

  it("shows the page to a logged-in organizer", () => {
    renderAt("/queue/abc", { session: fakeSession, isLoading: false });
    expect(screen.getByText("organizer view")).toBeInTheDocument();
  });
});
