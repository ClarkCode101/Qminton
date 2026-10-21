import { createClient } from "@supabase/supabase-js";

import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { Database } from "@/types/database";

// The ONLY place the Supabase client is created. Every other file talks to
// Supabase through the functions in src/services/*.ts.
//
// Only the public (publishable/anon) key belongs here. It is safe to ship to
// the browser because Row Level Security decides what each user can access.
// Never put the service role key in frontend code or in a VITE_* variable.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing Supabase settings. Copy web/.env.example to web/.env.local and fill in " +
      "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
  );
}

// <Database> = the generated types, so every query is type-checked against the real schema.
// Requests give up after 15 s instead of hanging on a slow connection.
export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  global: { fetch: fetchWithTimeout() },
});
