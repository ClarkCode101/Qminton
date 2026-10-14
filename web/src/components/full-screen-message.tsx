import type { ReactNode } from "react";
import { Link } from "react-router";

interface Props {
  title: string;
  message?: string;
  linkTo?: string;
  linkLabel?: string;
  children?: ReactNode;
}

// Simple centered screen for loading, "not found" and placeholder states.
export function FullScreenMessage({ title, message, linkTo, linkLabel, children }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#eff6ff,#f8fbff_36%,#eef6ff)] p-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-black tracking-tight text-slate-900">{title}</h1>
        {message && <p className="mt-3 text-sm leading-6 text-slate-500">{message}</p>}
        {linkTo && linkLabel && (
          <Link
            to={linkTo}
            className="mt-6 inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            {linkLabel}
          </Link>
        )}
        {children}
      </div>
    </div>
  );
}
