import { z } from "zod";

// Helpers for "after logging in, go back to the page you wanted".

export function buildLoginPath(nextPath: string): string {
  return nextPath === "/" ? "/login" : `/login?next=${encodeURIComponent(nextPath)}`;
}

// Only allow paths inside this app (e.g. "/queue/abc"). Anything else, such as
// "https://evil.example" or "//evil.example", falls back to "/" so the login
// page can't be used to bounce people to another website.
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  return next;
}

export const loginFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Please enter your email")
    .max(254, "Email is too long")
    .pipe(z.email("Please enter a valid email")),
  // No length rule here: the owner picks passwords in the Supabase dashboard.
  // 72 is the most bcrypt (Supabase's password hashing) will look at.
  password: z.string().min(1, "Please enter your password").max(72, "Password is too long"),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
