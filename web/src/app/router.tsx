import { createBrowserRouter } from "react-router";

import { FullScreenMessage } from "@/components/full-screen-message";
import { RequireAuth } from "@/features/auth/require-auth";

// Each page is loaded lazily so a visitor only downloads the code for the
// screen they open (e.g. the public display never loads the billing code).
export const router = createBrowserRouter([
  {
    path: "/login",
    lazy: async () => ({ Component: (await import("@/pages/login-page")).LoginPage }),
  },
  {
    // Public: anyone with the link can watch the courts, no login needed.
    path: "/queue/:queueId/display",
    lazy: async () => ({ Component: (await import("@/pages/display-page")).DisplayPage }),
  },
  {
    // Organizer pages: only for logged-in users.
    element: <RequireAuth />,
    children: [
      {
        path: "/",
        lazy: async () => ({ Component: (await import("@/pages/home-page")).HomePage }),
      },
      {
        path: "/landing",
        lazy: async () => ({ Component: (await import("@/pages/landing-page")).LandingPage }),
      },
      {
        path: "/queue/:queueId",
        lazy: async () => ({ Component: (await import("@/pages/queue-page")).QueuePage }),
      },
    ],
  },
  {
    path: "*",
    element: <FullScreenMessage title="Page not found" linkTo="/" linkLabel="Back to Qminton" />,
  },
]);
