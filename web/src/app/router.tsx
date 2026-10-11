import { createBrowserRouter } from "react-router";

import { FullScreenMessage } from "@/components/full-screen-message";

// Each page is loaded lazily so a visitor only downloads the code for the
// screen they open (e.g. the public display never loads the billing code).
export const router = createBrowserRouter([
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
  {
    path: "/queue/:queueId/display",
    lazy: async () => ({ Component: (await import("@/pages/display-page")).DisplayPage }),
  },
  {
    path: "*",
    element: <FullScreenMessage title="Page not found" linkTo="/" linkLabel="Back to Qminton" />,
  },
]);
