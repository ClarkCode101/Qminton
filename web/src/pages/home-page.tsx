import { FullScreenMessage } from "@/components/full-screen-message";
import { useAuth } from "@/features/auth/auth-context";
import { SignOutButton } from "@/features/auth/sign-out-button";

// Placeholder until this screen is migrated from the old OrcaRally app.
// The "Log out" button moves to the navbar in step 4.
export function HomePage() {
  const { session } = useAuth();

  return (
    <FullScreenMessage title="Home" message="This screen is being migrated to Qminton.">
      <p className="mt-4 text-sm text-slate-500">
        Logged in as <span className="font-semibold text-slate-700">{session?.user.email}</span>
      </p>
      <SignOutButton className="mt-4" />
    </FullScreenMessage>
  );
}
