import { useState } from "react";

import { useToast } from "@/hooks/use-toast";
import { signOut } from "@/services/auth";

// Logging out clears the session; RequireAuth then sends the user to /login.
export function SignOutButton({ className = "" }: { className?: string }) {
  const { showToast } = useToast();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleClick = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch {
      showToast("Could not log out. Please try again.", "error");
      setIsSigningOut(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isSigningOut}
      className={`inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 cursor-pointer ${className}`}
    >
      {isSigningOut ? "Logging out…" : "Log out"}
    </button>
  );
}
