import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";

import { ConfirmActionModal } from "@/components/confirm-action-modal";
import { useCheckInSettings, useUpdateCheckIn } from "@/features/check-in/use-check-in";
import { AddPlayerModal } from "@/features/players/add-player-modal";
import { SKILL_LABELS } from "@/features/players/player-status";
import { EditPlanDialog } from "@/features/signups/edit-plan-dialog";
import { StartSessionDialog } from "@/features/signups/start-session-dialog";
import { useAddSignups, useRemoveSignup, useSignups, useStartSession } from "@/features/signups/use-signups";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatRelativeDate, formatSessionDate, gameModeLabel } from "@/lib/format";
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
  // "Edit": name, date and time.
  const [showEdit, setShowEdit] = useState(false);
  // Owner's addition: the organizer can put people on the list too.
  const [showAdd, setShowAdd] = useState(false);
  const addSignups = useAddSignups(queue.id);
  const [toRemove, setToRemove] = useState<Signup | null>(null);
  const signups = signupsQuery.data ?? [];

  return (
    // Like the Courts tab: from tablet width the panel stops above the bottom
    // navbar and only the share card / list scroll inside it. Phones scroll the page.
    <div className="app-shell-safe-bottom flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,#eff6ff,#f8fbff_36%,#eef6ff)] md:overflow-hidden">
      {showStart && (
        <StartSessionDialog
          signups={signups}
          busy={startSession.isPending}
          onStart={(arrivedIds) => startSession.mutate(arrivedIds, { onSuccess: () => setShowStart(false) })}
          onClose={() => setShowStart(false)}
        />
      )}
      {showEdit && (
        <EditPlanDialog queue={{ id: queue.id, name: queue.name, startsAt: queue.starts_at }} onClose={() => setShowEdit(false)} />
      )}
      {showAdd && (
        <AddPlayerModal
          target="signups"
          existingNames={signups.map((signup) => signup.name)}
          queueId={queue.id}
          queueName={queue.name}
          onAdd={async (people) => {
            await addSignups.mutateAsync(people);
            setShowAdd(false);
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
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

      <div className="mx-auto w-full max-w-6xl p-4 sm:p-5 md:h-full lg:p-6">
        <section className="rounded-[28px] border border-sky-200 bg-white/95 shadow-sm md:flex md:h-full md:min-h-0 md:flex-col">
          <div className="flex flex-col gap-3 border-b border-sky-100 px-4 py-4 sm:px-5 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-600">Planned session</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="min-w-0 wrap-break-word text-xl font-black tracking-tight text-slate-900 sm:text-[1.55rem]">{queue.name}</h1>
                <button
                  type="button"
                  onClick={() => setShowEdit(true)}
                  className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
                >
                  Edit
                </button>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{queue.starts_at ? formatSessionDate(queue.starts_at) : "No date yet"}</span>
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

          <div className="grid gap-4 p-4 sm:p-5 md:min-h-0 md:flex-1 md:grid-cols-[19rem_minmax(0,1fr)] lg:grid-cols-[22rem_minmax(0,1fr)]">
            <ShareCard queue={queue} />

            <div className="min-w-0 rounded-3xl border border-slate-200 md:flex md:min-h-0 md:flex-col">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900">
                    Going <span className="font-semibold text-slate-500">({signups.length})</span>
                  </h2>
                  <p className="text-xs text-slate-500">Updates live as people sign up</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdd(true)}
                  disabled={signupsQuery.isPending}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
                >
                  + Add people
                </button>
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
                <p className="px-4 py-10 text-center text-sm text-slate-500">No one yet. Share the link in your group chat, or add people yourself.</p>
              ) : (
                <ul className="divide-y divide-slate-100 md:min-h-0 md:flex-1 md:overflow-y-auto" aria-label="Sign-up list">
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
    <div className="rounded-3xl border border-slate-200 p-4 md:min-h-0 md:overflow-y-auto">
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
          <QRCodeSVG value={url} size={180} level="M" marginSize={2} title="QR code for sign-up" className="h-auto max-w-full" />
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
