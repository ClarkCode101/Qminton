import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useSearchParams } from "react-router";

import { FullScreenMessage } from "@/components/full-screen-message";
import { QmintonLogo } from "@/components/qminton-logo";
import { useAuth } from "@/features/auth/auth-context";
import { CourtBackdrop } from "@/features/auth/court-backdrop";
import { useToast } from "@/hooks/use-toast";
import { loginFormSchema, safeNextPath, type LoginFormValues } from "@/lib/auth-redirect";
import { signInWithPassword } from "@/services/auth";

// Turns Supabase errors into something an organizer can act on.
function describeLoginError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "invalid_credentials") {
    return "Wrong email or password.";
  }
  if (code === "over_request_rate_limit") {
    return "Too many login attempts. Please wait a few minutes and try again.";
  }
  return "Could not log in. Check your connection and try again.";
}

const fieldBoxClass =
  "rounded-2xl border bg-sky-50/45 px-3.5 py-2.5 transition-colors focus-within:bg-white";
const inputClass = "w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-500";

// Eye icons for the show/hide password button (same 24px outline style as the navbar icons).
function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      {crossed ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
      ) : (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </>
      )}
    </svg>
  );
}

export function LoginPage() {
  const { session, isLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const { showToast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
  });
  // Typing a password on a phone is error-prone, so let people check it.
  const [showPassword, setShowPassword] = useState(false);

  if (isLoading) {
    return <FullScreenMessage title="Loading…" />;
  }

  // Logged in: go to the page they wanted. This also runs right after a
  // successful login, because AuthProvider updates `session`.
  if (session) {
    return <Navigate to={nextPath} replace />;
  }

  const onSubmit = async ({ email, password }: LoginFormValues) => {
    try {
      await signInWithPassword(email, password);
    } catch (error) {
      showToast(describeLoginError(error), "error");
    }
  };

  return (
    // Login card on top of a full-screen badminton court (redesign 2026-10-19).
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <CourtBackdrop />

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="relative w-full max-w-sm rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.35)] backdrop-blur-sm sm:p-7"
      >
        <div className="flex justify-center">
          <QmintonLogo size={56} />
        </div>
        <h1 className="mt-6 text-center text-xl font-black tracking-tight text-slate-900">Organizer Login</h1>
        <p className="mt-1 text-center text-sm leading-5 text-slate-500">
          Use the account given to you by the admin.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-slate-600">
              Email
            </label>
            <div
              className={`${fieldBoxClass} ${
                errors.email ? "border-rose-300" : "border-sky-100 focus-within:border-sky-200"
              }`}
            >
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                autoFocus
                placeholder="you@example.com"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? "login-email-error" : undefined}
                className={inputClass}
                {...register("email")}
              />
            </div>
            {errors.email && (
              <p id="login-email-error" className="mt-2 text-xs font-medium text-rose-600">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-slate-600">
              Password
            </label>
            <div
              className={`flex items-center gap-2 ${fieldBoxClass} ${
                errors.password ? "border-rose-300" : "border-sky-100 focus-within:border-sky-200"
              }`}
            >
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? "login-password-error" : undefined}
                className={inputClass}
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-controls="login-password"
                className="-my-1 -mr-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                <EyeIcon crossed={showPassword} />
              </button>
            </div>
            {errors.password && (
              <p id="login-password-error" className="mt-2 text-xs font-medium text-rose-600">
                {errors.password.message}
              </p>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
        >
          {isSubmitting ? "Logging in…" : "Log In"}
        </button>
      </form>
    </div>
  );
}
