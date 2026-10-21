import { QRCodeSVG } from "qrcode.react";
import { useEffect, useId, useState } from "react";

import { CloseButton } from "@/components/close-button";
import { ConfirmActionModal } from "@/components/confirm-action-modal";
import { useCheckInSettings, useUpdateCheckIn } from "@/features/check-in/use-check-in";
import { SKILL_LABELS } from "@/features/players/player-status";
import { isValidDateTimeLocal } from "@/features/queues/queue-form-schema";
import { StartSessionDialog } from "@/features/signups/start-session-dialog";
import { useChangePlanDate, useRemoveSignup, useSignups, useStartSession } from "@/features/signups/use-signups";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatRelativeDate, formatSessionDate, gameModeLabel, toDateTimeLocalValue } from "@/lib/format";
import { getCheckInUrl } from "@/lib/routes";
import type { Queue } from "@/services/queues";
import type { Signup } from "@/services/signups";

const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer disabled:cursor-wait disabled:opacity-60";

// The Courts tab of a planned queue (owner's addition, 2026-10-21): share the
// sign-up link, watch the list fill up, then "Start session" on the day.
export function PlannedSession({ queue }: { queue: Queue }) {
  const signupsQuery = useSignups(queue.id);
  const removeSignup = useRemoveSignup(queue.id);
  const startSession = useStartSession(queue.id);
  const [showStart, setShowStart] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [toRemove, setToRemove] = useState<Signup | null>(null);
  const signups = signupsQuery.data ?? [];

  return (
    <div className="app-shell-safe-bottom flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,#eff6ff,#f8fbff_36%,#eef6ff)]">
      {showStart && (
        <StartSessionDialog
          signups={signups}
          busy={startSession.isPending}
          onStart={(arrivedIds) => startSession.mutate(arrivedIds, { onSuccess: () => setShowStart(false) })}
          onClose={() => setShowStart(false)}
        />
      )}
      {showDate && <PlanDateDialog queue={queue} onClose={() => setShowDate(false)} />}
      {toRemove && (
        <ConfirmActionModal
          title="Remove from the list?"
          message={`Remove ${toRemove.name} from the sign-up list? They can sign up again with the link.`}
          confirmLabel="Remove"
          tone="danger"
          busy={removeSignup.isPending}
          onConfirm={async () => {
            try {
              await removeSignup.mutateAsync({ id: toRemove.id, name: toRemove.name });
              setToRemove(null);
            } catch {
              // Toast already shown.
            }
          }}
          onClose={() => setToRemove(null)}
        />
      )}

      <div className="mx-auto w-full max-w-6xl p-4 sm:p-5 lg:p-6">
        <section className="rounded-[28px] border border-sky-200 bg-white/95 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-sky-100 px-4 py-4 sm:px-5 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-600">Planned session</p>
              <h1 className="mt-1 break-words text-xl font-black tracking-tight text-slate-900 sm:text-[1.55rem]">{queue.name}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{queue.starts_at ? formatSessionDate(queue.starts_at) : "No date yet"}</span>
                <button type="button" onClick={() => setShowDate(true)} className="text-sm font-semibold text-blue-600 hover:underline cursor-pointer">
                  Change
                </button>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span>
                  {gameModeLabel(queue.game_mode)} · {formatCurrency(queue.court_fee)} court fee · {formatCurrency(queue.game_rate)}/game
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowStart(true)}
              disabled={signupsQuery.isPending}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
            >
              Start session
            </button>
          </div>

          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <ShareCard queue={queue} />

            <div className="min-w-0 rounded-3xl border border-slate-200">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <h2 className="text-base font-bold text-slate-900">
                  Going <span className="font-semibold text-slate-500">({signups.length})</span>
                </h2>
                <p className="text-xs text-slate-500">Updates live as people sign up</p>
              </div>
              {signupsQuery.isPending ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">Loading...</p>
              ) : signupsQuery.isError ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  Could not load the list.{" "}
                  <button type="button" onClick={() => void signupsQuery.refetch()} className="font-semibold text-blue-600 hover:underline cursor-pointer">
                    Try again
                  </button>
                </p>
              ) : signups.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-500">No one yet. Share the link in your group chat.</p>
              ) : (
                <ul className="divide-y divide-slate-100" aria-label="Sign-up list">
                  {signups.map((signup, index) => (
                    <li key={signup.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-400">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{signup.name}</p>
                        <p className="text-xs text-slate-500">
                          {SKILL_LABELS[signup.skill]} · {formatRelativeDate(signup.created_at)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setToRemove(signup)}
                        aria-label={`Remove ${signup.name}`}
                        className="inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-semibold text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ShareCard({ queue }: { queue: Queue }) {
  const settingsQuery = useCheckInSettings(queue.id);
  const update = useUpdateCheckIn(queue.id, "Sign-ups");
  const { showToast } = useToast();
  const [showQr, setShowQr] = useState(false);
  const [confirmNewCode, setConfirmNewCode] = useState(false);
  const settings = settingsQuery.data;

  if (settingsQuery.isPending) return <p className="py-10 text-center text-sm text-slate-500">Loading...</p>;
  if (settingsQuery.isError || !settings) {
    return (
      <p className="py-10 text-center text-sm text-slate-500">
        Could not load the link.{" "}
        <button type="button" onClick={() => void settingsQuery.refetch()} className="font-semibold text-blue-600 hover:underline cursor-pointer">
          Try again
        </button>
      </p>
    );
  }

  const url = getCheckInUrl(settings.token);
  // Ready to paste in a group chat.
  const invite = `${queue.name}${queue.starts_at ? ` – ${formatSessionDate(queue.starts_at)}` : ""}\nSign up here: ${url}`;

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      showToast("Invite copied. Paste it in your group chat.", "success");
    } catch {
      showToast("Failed to copy", "error");
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: queue.name, text: invite });
    } catch {
      // Closed the share sheet: nothing to do.
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 p-4">
      <h2 className="text-base font-bold text-slate-900">Share with your group</h2>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className={`h-2.5 w-2.5 rounded-full ${settings.is_open ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden="true" />
          {settings.is_open ? "Sign-ups open" : "Sign-ups closed"}
        </span>
        <button
          type="button"
          onClick={() => update.mutate({ open: !settings.is_open })}
          disabled={update.isPending}
          className="text-sm font-semibold text-blue-600 hover:underline disabled:opacity-60 cursor-pointer"
        >
          {settings.is_open ? "Close" : "Open"}
        </button>
      </div>

      <p className="mt-3 break-all rounded-2xl border border-slate-200 px-3 py-2 text-xs text-slate-600">{url}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => void copyInvite()} className={secondaryButtonClass}>
          Copy invite
        </button>
        {typeof navigator.share === "function" ? (
          <button type="button" onClick={() => void share()} className={secondaryButtonClass}>
            Share…
          </button>
        ) : (
          <button type="button" onClick={() => setShowQr((current) => !current)} className={secondaryButtonClass} aria-expanded={showQr}>
            {showQr ? "Hide QR" : "Show QR"}
          </button>
        )}
      </div>
      {typeof navigator.share === "function" && (
        <button type="button" onClick={() => setShowQr((current) => !current)} className="mt-2 text-sm font-semibold text-blue-600 hover:underline cursor-pointer" aria-expanded={showQr}>
          {showQr ? "Hide QR code" : "Show QR code"}
        </button>
      )}
      {showQr && (
        <div className="mt-3 flex justify-center rounded-2xl border border-sky-100 p-3">
          <QRCodeSVG value={url} size={200} level="M" marginSize={2} title="QR code for sign-up" className="h-auto max-w-full" />
        </div>
      )}

      <p className="mt-3 text-xs leading-5 text-slate-500">
        People see the date, the fees and who is going, and can cancel their own spot. No charges until you start the session.{" "}
        <button type="button" onClick={() => setConfirmNewCode(true)} className="font-semibold text-slate-600 underline-offset-2 hover:underline cursor-pointer">
          New link
        </button>
      </p>

      {confirmNewCode && (
        <ConfirmActionModal
          title="Make a new link?"
          message="The current link and QR code will stop working. People already on the list stay on it, but can only cancel by asking you."
          confirmLabel="Make New Link"
          tone="default"
          busy={update.isPending}
          onConfirm={async () => {
            try {
              await update.mutateAsync({ newCode: true });
              setConfirmNewCode(false);
            } catch {
              // Toast already shown.
            }
          }}
          onClose={() => setConfirmNewCode(false)}
        />
      )}
    </div>
  );
}

function PlanDateDialog({ queue, onClose }: { queue: Queue; onClose: () => void }) {
  const ids = useId();
  const changeDate = useChangePlanDate(queue.id);
  const [value, setValue] = useState(queue.starts_at ? toDateTimeLocalValue(queue.starts_at) : "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !changeDate.isPending) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [changeDate.isPending, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!isValidDateTimeLocal(value)) {
            setError("Please pick the date and time");
            return;
          }
          changeDate.mutate(new Date(value).toISOString(), { onSuccess: onClose });
        }}
        className="w-full max-w-sm rounded-[28px] border border-sky-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id={`${ids}-title`} className="text-lg font-bold text-slate-900">
            Date and time
          </h2>
          <CloseButton label="Close date and time" onClick={onClose} disabled={changeDate.isPending} size="sm" />
        </div>
        <label htmlFor={`${ids}-when`} className="sr-only">
          Date and time
        </label>
        <input
          id={`${ids}-when`}
          type="datetime-local"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          className="mt-4 h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={changeDate.isPending} className={secondaryButtonClass}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={changeDate.isPending}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
          >
            {changeDate.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
