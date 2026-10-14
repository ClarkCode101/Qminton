import type { Session } from "@supabase/supabase-js";
import { createContext, useContext } from "react";

export interface AuthState {
  // null = not logged in
  session: Session | null;
  // true until we know whether a saved login exists (first page load)
  isLoading: boolean;
}

export const AuthContext = createContext<AuthState>({ session: null, isLoading: true });

export function useAuth() {
  return useContext(AuthContext);
}
