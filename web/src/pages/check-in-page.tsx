import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router";

import { LoadError } from "@/components/load-error";
import { QmintonMark } from "@/components/qminton-logo";
import { LiveCourts } from "@/features/display/live-courts";
import { displayKeys } from "@/features/display/use-display";
import { MAX_PLAYER_NAME_LENGTH } from "@/features/players/bulk-names";
import { SkillSegmented } from "@/features/players/skill-picker";
import { useQueueLiveUpdates } from "@/hooks/use-queue-live-updates";
import { formatCurrency, formatSessionDate, gameModeLabel } from "@/lib/format";
import { addMyCheckIn, readMyCheckIns, removeMyCheckIn } from "@/lib/my-check-ins";
import { readMySignups, writeMySignups } from "@/lib/my-signups";
import { checkIn, leaveQueue, type CheckInResult } from "@/services/check-in";
import { toUserMessage } from "@/services/errors";
import type { SkillLevel } from "@/services/players";
import { cancelSignup, getSignupPage, signUp, type MySignup, type SignupPage } from "@/services/signups";

const primaryButtonClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer";

// The public link / QR of a queue (no login). While the session is planned,
// people sign up, see who is going and can cancel their own spot (owner's
// addition, 2026-10-21). Once it is live, the same link is the self check-in:
// type your name and skill and you're added to the queue.
export function CheckInPage() {
  const { token = "" } = useParams();
  // Codes this phone got when signing up (to show "You're going" and cancel).
  const [mySignups, setMySignups] = useState<MySignup[]>(() => readMySignups(token));
  // Codes this phone got when checking in on a live session (to show "You're in" and leave).
  const [myCheckIns, setMyCheckIns] = useState<MySignup[]>(() => readMyCheckIns(token));
  // Both go to the server; it matches the sign-ups (planned) or the players (live).
  const codes = [...mySignups, ...myCheckIns].map((item) => item.code);
  const infoQuery = useQuery({
    queryKey: ["join", token, codes],
    queryFn: () => getSignupPage(token, codes),
    placeholderData: keepPreviousData,
  });
  // The list (and the courts, once live) update as others sign up, cancel or play.
  const queryClient = useQueryClient();
  const queueId = infoQuery.data?.queueId ?? "";
  useQueueLiveUpdates(queueId, () => {
    void infoQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: displayKeys.detail(queueId) });
  });

  const saveMine = (next: MySignup[]) => {
    writeMySignups(token, next);
    setMySignups(next);
  };

  if (infoQuery.isPending) {
    return (
      <Screen>
        <p className="text-center text-sm text-slate-500">Loading...</p>
      </Screen>
    );
  }
  if (infoQuery.isError) {
    return <LoadError message="Could not load this page. Check your connection and try again." onRetry={() => void infoQuery.refetch()} />;
  }

  const info = infoQuery.data;
  if (!info) {
    return (
      <Screen>
        <h1 className="text-xl font-black tracking-tight text-slate-900">This link is no longer valid</h1>
        <p className="mt-2 text-sm text-slate-500">Please ask the organizer for the new link or QR code.</p>
      </Screen>
    );
  }

  if (info.status === "planned") {
    return <SignupView token={token} info={info} mySignups={mySignups} onMineChange={saveMine} onChanged={() => void infoQuery.refetch()} />;
  }
  return <CheckInView token={token} info={info} onMineChange={setMyCheckIns} onChanged={() => void infoQuery.refetch()} />;
}

// ---------------------------------------------------------------------------
// Planned session: sign up / cancel
// ---------------------------------------------------------------------------
function SignupView({
  token,
  info,
  mySignups,
  onMineChange,
  onChanged,
}: {
  token: string;
  info: SignupPage;
  mySignups: MySignup[];
  onMineChange: (next: MySignup[]) => void;
  onChanged: () => void;
}) {
  // Spots from this phone that are still on the list (the organizer may have removed one).
  const mine = info.mine;
  const [justJoined, setJoined] = useState<{ name: string; position: number } | null>(null);
  const cancel = useMutation({
    mutationFn: (signup: MySignup) => cancelSignup(token, signup.code),
    onSuccess: (_, signup) => {
      onMineChange(mySignups.filter((item) => item.code !== signup.code));
      setJoined(null);
      onChanged();
    },
  });

  return (
    <Screen>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">Sign up</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">{info.queueName}</h1>
      {info.startsAt && <p className="mt-1 text-base font-semibold text-slate-800">{formatSessionDate(info.startsAt)}</p>}
      <p className="mt-1 text-sm text-slate-500">
        {gameModeLabel(info.gameMode)} · Court fee {formatCurrency(info.courtFee)} · {formatCurrency(info.gameRate)} per game
      </p>

      {justJoined && (
        <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          You're in, {justJoined.name}! You're #{justJoined.position} on the list.
        </p>
      )}

      {mine.length > 0 && (
        <div className="mt-5 rounded-2xl border border-slate-200 p-3">
          <p className="text-sm font-semibold text-slate-800">Going from this phone</p>
          <ul className="mt-2 space-y-2">
            {mine.map((signup) => (
              <li key={signup.code} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-slate-700">✓ {signup.name}</span>
                <button
                  type="button"
                  onClick={() => cancel.mutate(signup)}
                  disabled={cancel.isPending}
                  className="inline-flex min-h-9 shrink-0 items-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-60 cursor-pointer"
                >
                  Cancel {mine.length > 1 ? `${signup.name}'s spot` : "my spot"}
                </button>
              </li>
            ))}
          </ul>
          {cancel.isError && (
            <p role="alert" className="mt-2 text-xs font-medium text-rose-600">
              {toUserMessage(cancel.error, "Could not cancel. Please try again.")}
            </p>
          )}
        </div>
      )}

      {info.isOpen ? (
        <SignupForm
          token={token}
          title={mine.length > 0 ? "Sign up someone else" : undefined}
          onJoined={(result) => {
            onMineChange([...mySignups, { code: result.code, name: result.name }]);
            setJoined({ name: result.name, position: result.position });
            onChanged();
          }}
        />
      ) : (
        <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Sign-ups are closed. Please ask the organizer.
        </p>
      )}

      <div className="mt-6 border-t border-slate-100 pt-4">
        <h2 className="text-sm font-bold text-slate-900">
          Going <span className="font-semibold text-slate-500">({info.going.length})</span>
        </h2>
        {info.going.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No one yet. Be the first!</p>
        ) : (
          <ol className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm text-slate-700 min-[360px]:grid-cols-2" aria-label="Going">
            {info.going.map((name, index) => (
              <li key={`${name}-${index}`} className="flex min-w-0 gap-2">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums leading-5 text-slate-400">{index + 1}</span>
                <span className="truncate">{name}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Screen>
  );
}

function SignupForm({
  token,
  title,
  onJoined,
}: {
  token: string;
  title?: string;
  onJoined: (result: { name: string; position: number; code: string }) => void;
}) {
  const ids = useId();
  const [name, setName] = useState("");
  const [skill, setSkill] = useState<SkillLevel | null>(null);
  const join = useMutation({ mutationFn: () => signUp(token, { name: name.trim(), skill: skill ?? "beginner" }) });

  const trimmed = name.trim();
  const nameError = trimmed.length > MAX_PLAYER_NAME_LENGTH ? `Name must be ${MAX_PLAYER_NAME_LENGTH} characters or less` : null;
  const canJoin = trimmed.length > 0 && !nameError && skill !== null && !join.isPending;

  return (
    <form
      noValidate
      className="mt-5 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canJoin) return;
        join.mutate(undefined, {
          onSuccess: (result) => {
            setName("");
            setSkill(null);
            onJoined(result);
          },
        });
      }}
    >
      {title && <p className="text-sm font-bold text-slate-900">{title}</p>}
      <NameField
        id={`${ids}-name`}
        label={title ? "Their name" : "Your name"}
        value={name}
        error={nameError}
        onChange={(value) => {
          setName(value);
          join.reset();
        }}
      />
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">{title ? "Their skill level" : "Your skill level"}</p>
        <SkillSegmented value={skill} onChange={setSkill} label={title ? "Their skill level" : "Your skill level"} fill="always" />
      </div>
      {join.isError && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {toUserMessage(join.error, "Could not sign up. Please try again.")}
        </p>
      )}
      <button type="submit" disabled={!canJoin} className={primaryButtonClass}>
        {join.isPending ? "Signing up..." : "Sign up"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Live session: self check-in, and a "View courts" button that shows who is
// playing on this same page (one QR for joining and watching; owner's request
// 2026-10-21). The courts view is "?view=courts", so the phone's back button
// returns to the form. No "Organizer View" link here: players only.
// ---------------------------------------------------------------------------
function CheckInView({
  token,
  info,
  onMineChange,
  onChanged,
}: {
  token: string;
  info: SignupPage;
  onMineChange: (next: MySignup[]) => void;
  onChanged: () => void;
}) {
  const ids = useId();
  const [name, setName] = useState("");
  const [skill, setSkill] = useState<SkillLevel | null>(null);
  // The join just made (with the spot in line); gone after a refresh.
  const [joined, setJoined] = useState<CheckInResult | null>(null);
  // "Add someone else" shows the form again.
  const [addingAnother, setAddingAnother] = useState(false);
  // Shown after leaving the queue.
  const [leftMessage, setLeftMessage] = useState<string | null>(null);
  const join = useMutation({ mutationFn: () => checkIn(token, { name: name.trim(), skill: skill ?? "beginner" }) });
  const [searchParams, setSearchParams] = useSearchParams();

  const onLeft = (result: { name: string; refunded: number }, code: string) => {
    onMineChange(removeMyCheckIn(token, code));
    if (joined?.code === code) setJoined(null);
    setLeftMessage(
      result.refunded > 0
        ? `${result.name} left the queue. The ${formatCurrency(result.refunded)} court fee was taken off.`
        : `${result.name} left the queue.`,
    );
    onChanged();
  };

  // Players from this phone still in the queue (the server checks the codes, so
  // someone the organizer removed drops off). The welcome uses the join just made
  // while that list reloads (a moment).
  const mine = info.mine;
  const joinedNames = joined && !mine.some((item) => item.code === joined.code) ? [...mine.map((item) => item.name), joined.name] : mine.map((item) => item.name);
  const showJoined = (joined !== null || mine.length > 0) && !addingAnother;

  const leftNotice = leftMessage && (
    <p role="status" className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
      {leftMessage}
    </p>
  );

  // Once joined, watching is the main thing left to do: the blue button.
  const viewCourts = (
    <button
      type="button"
      onClick={() => setSearchParams({ view: "courts" })}
      className={showJoined ? primaryButtonClass : secondaryButtonClass}
    >
      View courts
    </button>
  );

  if (searchParams.get("view") === "courts") {
    const backLabel = showJoined || !info.isOpen ? "Back" : "Join the queue";
    return (
      <Screen wide>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-500">{info.queueName}</p>
        <LiveCourts queueId={info.queueId} highlight={joinedNames} />
        <div className="mt-6 flex justify-center">
          <button type="button" onClick={() => setSearchParams({})} className={`${primaryButtonClass} sm:max-w-xs`}>
            {backLabel}
          </button>
        </div>
      </Screen>
    );
  }

  if (showJoined) {
    return (
      <Screen below={viewCourts}>
        {leftNotice}
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-600">You're in</p>
        {joined ? (
          <>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Welcome, {joined.name}!</h1>
            <p className="mt-2 text-sm text-slate-600">
              You're <span className="font-semibold text-slate-900">#{joined.position}</span> in line for {info.queueName}. Tap
              View courts to see when you play.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">{info.queueName}</h1>
            <p className="mt-2 text-sm text-slate-600">Tap View courts to see when you play.</p>
          </>
        )}
        {/* Each name can leave from here (owner's request): not while playing / in Up Next. */}
        {mine.length > 0 && <MyPlayers mine={mine} onLeft={onLeft} />}
        {info.isOpen && (
          <button
            type="button"
            onClick={() => {
              setJoined(null);
              setAddingAnother(true);
              setLeftMessage(null);
              setName("");
              setSkill(null);
              join.reset();
            }}
            className={`mt-6 ${secondaryButtonClass}`}
          >
            Add someone else
          </button>
        )}
      </Screen>
    );
  }

  if (!info.isOpen) {
    return (
      <Screen below={viewCourts}>
        {leftNotice}
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-500">{info.queueName}</p>
        <h1 className="mt-1 text-xl font-black tracking-tight text-slate-900">Check-in is closed</h1>
        <p className="mt-2 text-sm text-slate-500">Ask the organizer if you still need to join.</p>
      </Screen>
    );
  }

  const trimmed = name.trim();
  const nameError = trimmed.length > MAX_PLAYER_NAME_LENGTH ? `Name must be ${MAX_PLAYER_NAME_LENGTH} characters or less` : null;
  const canJoin = trimmed.length > 0 && !nameError && skill !== null && !join.isPending;

  return (
    <Screen below={viewCourts}>
      {leftNotice}
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-500">Join the queue</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">{info.queueName}</h1>

      <form
        noValidate
        className="mt-6 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canJoin) return;
          join.mutate(undefined, {
            onSuccess: (result) => {
              onMineChange(addMyCheckIn(token, { name: result.name, code: result.code }));
              setJoined(result);
              setAddingAnother(false);
              setLeftMessage(null);
            },
          });
        }}
      >
        <NameField
          id={`${ids}-name`}
          label="Your name"
          value={name}
          error={nameError}
          onChange={(value) => {
            setName(value);
            join.reset();
          }}
        />

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Your skill level</p>
          <SkillSegmented value={skill} onChange={setSkill} label="Your skill level" fill="always" />
        </div>

        {join.isError && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {toUserMessage(join.error, "Could not join. Please try again.")}
          </p>
        )}

        <button type="submit" disabled={!canJoin} className={primaryButtonClass}>
          {join.isPending ? "Joining..." : "Join"}
        </button>
        {addingAnother && (
          <button type="button" onClick={() => setAddingAnother(false)} className={secondaryButtonClass}>
            Cancel
          </button>
        )}
      </form>
    </Screen>
  );
}

// The players this phone checked in, each with "Leave queue" (asks first).
function MyPlayers({
  mine,
  onLeft,
}: {
  mine: MySignup[];
  onLeft: (result: { name: string; refunded: number }, code: string) => void;
}) {
  // The row asking "Leave the queue?" (its code).
  const [confirming, setConfirming] = useState<string | null>(null);
  const leave = useMutation({
    mutationFn: (code: string) => leaveQueue(code),
    onSuccess: (result, code) => {
      setConfirming(null);
      onLeft(result, code);
    },
  });

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 p-3">
      <p className="text-sm font-semibold text-slate-800">Joined from this phone</p>
      <ul className="mt-1 divide-y divide-slate-100">
        {mine.map((item) => (
          <li key={item.code} className="py-2">
            {confirming === item.code ? (
              <div>
                <p className="text-sm font-semibold text-slate-800">Leave the queue, {item.name}?</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => leave.mutate(item.code)}
                    disabled={leave.isPending}
                    className="inline-flex min-h-9 flex-1 items-center justify-center rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                  >
                    {leave.isPending ? "Leaving..." : "Leave"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(null);
                      leave.reset();
                    }}
                    className="inline-flex min-h-9 flex-1 items-center justify-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
                  >
                    Stay
                  </button>
                </div>
                {leave.isError && (
                  <p role="alert" className="mt-2 text-xs font-medium text-rose-600">
                    {toUserMessage(leave.error, "Could not leave. Please try again.")}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-slate-700">✓ {item.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(item.code);
                    leave.reset();
                  }}
                  className="inline-flex min-h-9 shrink-0 items-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 cursor-pointer"
                >
                  Leave queue
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NameField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="e.g. Juan Dela Cruz"
        autoComplete="name"
        aria-invalid={error ? true : undefined}
        className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-800 outline-none transition-colors placeholder:text-slate-500 focus:border-blue-300 focus:ring-2 focus:ring-sky-100"
      />
      {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

// `below` = shown under the card (the "View courts" button).
// `wide` = the courts view: phone width on phones, then wider so the courts
// sit 2 per row on a tablet and 3 on a laptop (the court cards follow their space).
function Screen({ children, below, wide = false }: { children: ReactNode; below?: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-[radial-gradient(circle_at_top,#dbeafe,#f8fafc_35%,#eef6ff)] px-4 py-10 sm:items-center">
      <div className={`w-full ${wide ? "max-w-sm sm:max-w-2xl lg:max-w-5xl" : "max-w-sm"}`}>
        <div className="mb-6 flex justify-center">
          <QmintonMark size={48} />
        </div>
        <div className="rounded-[28px] border border-sky-200 bg-white p-6 shadow-sm">{children}</div>
        {below && <div className="mt-4">{below}</div>}
      </div>
    </div>
  );
}
