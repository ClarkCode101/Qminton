import type { Session } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";

import { ToastProvider } from "@/components/toast";
import { AuthContext } from "@/features/auth/auth-context";

// Renders routes with the same providers as the real app (fresh cache per test,
// no retries so failures show immediately) and a logged-in fake session.
export function renderApp(routes: RouteObject[], initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const session = { user: { email: "organizer@example.com" } } as Session;

  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthContext.Provider value={{ session, isLoading: false }}>
          <RouterProvider router={router} />
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );

  return { router };
}
