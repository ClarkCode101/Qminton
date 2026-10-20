import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";

import { LoadError } from "@/components/load-error";
import { QmintonMark } from "@/components/qminton-logo";
import { MAX_PLAYER_NAME_LENGTH } from "@/features/players/bulk-names";
import { SkillSegmented } from "@/features/players/skill-picker";
import { getQueueDisplayPath } from "@/lib/routes";
import { checkIn, getCheckIn, type CheckInResult } from "@/services/check-in";
import { toUserMessage } from "@/services/errors";
import type { SkillLevel } from "@/services/players";

// Public check-in page (owner's addition): a player scans the organizer's QR,
// types their name and skill, and is added to the queue. No login.
export function CheckInPage() {
  const { token = "" } = useParams();
  const ids = useId();
  const infoQuery = useQuery({ queryKey: ["check-in", token], queryFn: () => getCheckIn(token) });
  const [name, setName] = useState("");
  const [skill, setSkill] = useState<SkillLevel | null>(null);
  const [joined, setJoined] = useState<CheckInResult | null>(null);
  const join = useMutation({ mutationFn: () => checkIn(token, { name: name.trim(), skill: skill ?? "beginner" }) });

  if (infoQuery.isPending) {
    return <Screen><p className="text-center text-sm text-slate-500">Loading...</p></Screen>;
  }
  if (infoQuery.isError) {
    return <LoadError message="Could not load check-in. Check your connection and try again." onRetry={() => void infoQuery.refetch()} />;
  }

  const info = infoQuery.data;
  if (!info) {
    return (
      <Screen>
        <h1 className="text-xl font-black tracking-tight text-slate-900">This QR code is no longer valid</h1>
        <p className="mt-2 text-sm text-slate-500">Please ask the organizer for the new check-in QR code.</p>
      </Screen>
    );
  }

  if (joined) {
    return (
      <Screen>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-600">You're in</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Welcome, {joined.name}!</h1>
        <p className="mt-2 text-sm text-slate-600">
          You're <span className="font-semibold text-slate-900">#{joined.position}</span> in line for {info.queueName}. The organizer
          will call you to a court.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            to={getQueueDisplayPath(joined.queueId)}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Watch the courts
          </Link>
          <button
            type="button"
            onClick={() => {
              setJoined(null);
              setName("");
              setSkill(null);
              join.reset();
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
          >
            Add someone else
          </button>
        </div>
      </Screen>
    );
  }

  if (!info.isOpen) {
    return (
      <Screen>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-500">{info.queueName}</p>
        <h1 className="mt-1 text-xl font-black tracking-tight text-slate-900">Check-in is closed</h1>
        <p className="mt-2 text-sm text-slate-500">Please ask the organizer to open check-in, then try again.</p>
        <button
          type="button"
          onClick={() => void infoQuery.refetch()}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
        >
          Try again
        </button>
      </Screen>
    );
  }

  const trimmed = name.trim();
  const nameError = trimmed.length > MAX_PLAYER_NAME_LENGTH ? `Name must be ${MAX_PLAYER_NAME_LENGTH} characters or less` : null;
  const canJoin = trimmed.length > 0 && !nameError && skill !== null && !join.isPending;

  return (
    <Screen>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-500">Join the queue</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">{info.queueName}</h1>

      <form
        noValidate
        className="mt-6 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canJoin) return;
          join.mutate(undefined, { onSuccess: setJoined });
        }}
      >
        <div>
          <label htmlFor={`${ids}-name`} className="mb-2 block text-sm font-semibold text-slate-700">
            Your name
          </label>
          <input
            id={`${ids}-name`}
            type="text"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              join.reset();
            }}
            placeholder="e.g. Juan Dela Cruz"
            autoComplete="name"
            aria-invalid={nameError ? true : undefined}
            className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-800 outline-none transition-colors placeholder:text-slate-500 focus:border-blue-300 focus:ring-2 focus:ring-sky-100"
          />
          {nameError && <p className="mt-1.5 text-xs font-medium text-rose-600">{nameError}</p>}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Your skill level</p>
          <SkillSegmented value={skill} onChange={setSkill} label="Your skill level" fill />
        </div>

        {join.isError && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {toUserMessage(join.error, "Could not join. Please try again.")}
          </p>
        )}

        <button
          type="submit"
          disabled={!canJoin}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          {join.isPending ? "Joining..." : "Join"}
        </button>
      </form>
    </Screen>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-[radial-gradient(circle_at_top,#dbeafe,#f8fafc_35%,#eef6ff)] px-4 py-10 sm:items-center">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <QmintonMark size={48} />
        </div>
        <div className="rounded-[28px] border border-sky-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
