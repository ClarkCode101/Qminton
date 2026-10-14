import { Navigate, Outlet, useLocation } from "react-router";

import { FullScreenMessage } from "@/components/full-screen-message";
import { useAuth } from "@/features/auth/auth-context";
import { buildLoginPath } from "@/lib/auth-redirect";

// Route guard: pages inside it need a logged-in organizer.
// Not logged in -> send to /login, remembering where they wanted to go.
export function RequireAuth() {
  const { session, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <FullScreenMessage title="Loading…" />;
  }

  if (!session) {
    return <Navigate to={buildLoginPath(location.pathname + location.search)} replace />;
  }

  return <Outlet />;
}
