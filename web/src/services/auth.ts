import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/services/supabase";

// All Supabase Auth calls live here so the rest of the app never touches
// `supabase.auth` directly.
//
// There is no sign-up in the app: only the owner creates accounts in the
// Supabase dashboard (Authentication -> Users -> Add user), and "Allow new
// users to sign up" is turned off there.

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

// Calls `callback` whenever the user logs in, logs out, or the token refreshes.
// Returns a function that stops listening.
export function onSessionChange(callback: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
