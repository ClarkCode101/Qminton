import { useEffect, useState, type ReactNode } from "react";

import { AuthContext, type AuthState } from "@/features/auth/auth-context";
import { getSession, onSessionChange } from "@/services/auth";

// Keeps track of who is logged in and shares it with the whole app.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, isLoading: true });

  useEffect(() => {
    let isActive = true;

    // 1) Restore a saved login (or read the one from a magic link in the URL).
    getSession()
      .then((session) => {
        if (isActive) setState({ session, isLoading: false });
      })
      .catch(() => {
        // A broken saved session just means "logged out", never a crash.
        if (isActive) setState({ session: null, isLoading: false });
      });

    // 2) Stay up to date when the user logs in or out (also in other tabs).
    const stopListening = onSessionChange((session) => {
      if (isActive) setState({ session, isLoading: false });
    });

    return () => {
      isActive = false;
      stopListening();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
