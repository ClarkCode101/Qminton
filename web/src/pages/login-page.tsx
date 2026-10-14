import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Navigate, useSearchParams } from "react-router";

import { FullScreenMessage } from "@/components/full-screen-message";
import { useAuth } from "@/features/auth/auth-context";
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
const inputClass = "w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400";

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
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#eff6ff,#f8fbff_36%,#eef6ff)] p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="w-full max-w-md rounded-[28px] border border-sky-200 bg-white p-5 shadow-2xl sm:p-6"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">Qminton</p>
        <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
          Organizer Login
        </h1>
        <p className="mt-1.5 text-sm leading-5 text-slate-500">
          Use the account given to you by the Qminton admin.
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
              className={`${fieldBoxClass} ${
                errors.password ? "border-rose-300" : "border-sky-100 focus-within:border-sky-200"
              }`}
            >
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? "login-password-error" : undefined}
                className={inputClass}
                {...register("password")}
              />
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
          className="mt-6 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
        >
          {isSubmitting ? "Logging in…" : "Log In"}
        </button>
      </form>
    </div>
  );
}
