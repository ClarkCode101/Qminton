import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";

import { ConfirmActionModal } from "@/components/confirm-action-modal";
import { useCheckInSettings, useUpdateCheckIn } from "@/features/check-in/use-check-in";
import { useToast } from "@/hooks/use-toast";
import { getCheckInUrl } from "@/lib/routes";

// The "QR check-in" tab of Add Players: players scan the QR, type their name
// and skill, and are added to the queue right away. The organizer opens /
// closes check-in and can make a new code so old QR codes stop working.
export function CheckInPanel({ queueId, queueName }: { queueId: string; queueName: string }) {
  const settingsQuery = useCheckInSettings(queueId);
  const update = useUpdateCheckIn(queueId);
  const { showToast } = useToast();
  const [confirmNewCode, setConfirmNewCode] = useState(false);
  const settings = settingsQuery.data;
  const url = settings ? getCheckInUrl(settings.token) : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast("Check-in link copied", "success");
    } catch {
      showToast("Failed to copy the link", "error");
    }
  };

  if (settingsQuery.isPending) {
    return <p className="py-10 text-center text-sm text-slate-500">Loading...</p>;
  }
  if (settingsQuery.isError || !settings) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-slate-600">Could not load check-in.</p>
        <button
          type="button"
          onClick={() => void settingsQuery.refetch()}
          className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 cursor-pointer"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Same layout as the planned session's "Invite players" card: title + status
  // pill, the QR, and small links under it.
  return (
    <div className="flex flex-col rounded-3xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">Scan to join</h2>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            settings.is_open ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${settings.is_open ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden="true" />
          {settings.is_open ? "Check-in is open" : "Check-in is closed"}
        </span>
      </div>

      {/* Faded while check-in is closed. */}
      <div className="mt-4 flex flex-col items-center">
        <div className="rounded-2xl border border-sky-100 bg-white p-2">
          <QRCodeSVG
            value={url}
            size={200}
            level="M"
            marginSize={1}
            title="QR code for player check-in"
            className={`h-auto max-w-full transition-opacity ${settings.is_open ? "" : "opacity-25"}`}
          />
        </div>
        <p className="mt-1.5 text-center text-xs text-slate-500">
          {settings.is_open ? `Players join ${queueName} from their phone` : "Open check-in so players can join"}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 text-xs">
        <button
          type="button"
          onClick={() => update.mutate({ open: !settings.is_open })}
          disabled={update.isPending}
          className="font-semibold text-blue-600 hover:underline disabled:opacity-60 cursor-pointer"
        >
          {settings.is_open ? "Close check-in" : "Open check-in"}
        </button>
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => void copyLink()} className="font-semibold text-slate-500 hover:underline cursor-pointer">
            Copy link
          </button>
          <button type="button" onClick={() => setConfirmNewCode(true)} className="font-semibold text-slate-500 hover:underline cursor-pointer">
            New code
          </button>
        </div>
      </div>

      {confirmNewCode && (
        <ConfirmActionModal
          title="Make a new check-in code?"
          message="The current QR code and link will stop working. Use this if the code was shared with people who shouldn't join."
          confirmLabel="Make New Code"
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
