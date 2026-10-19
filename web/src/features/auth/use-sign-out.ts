import { useState } from "react";

import { useToast } from "@/hooks/use-toast";
import { signOut } from "@/services/auth";

// Logging out clears the session; RequireAuth then sends the user to /login.
export function useSignOut() {
  const { showToast } = useToast();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch {
      showToast("Could not log out. Please try again.", "error");
      setIsSigningOut(false);
    }
  };

  return { signOut: handleSignOut, isSigningOut };
}
