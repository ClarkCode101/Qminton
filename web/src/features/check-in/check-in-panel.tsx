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

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-center text-sm text-slate-500">
        Players scan this, type their name and skill on their phone, and join {queueName} right away.
      </p>

      <div className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${settings.is_open ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden="true" />
          <span className="text-sm font-semibold text-slate-800">{settings.is_open ? "Check-in is open" : "Check-in is closed"}</span>
        </div>
        <button
          type="button"
          onClick={() => update.mutate({ open: !settings.is_open })}
          disabled={update.isPending}
          className={`inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-60 ${
            settings.is_open
              ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              : "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
          }`}
        >
          {settings.is_open ? "Close check-in" : "Open check-in"}
        </button>
      </div>

      <div className="relative rounded-3xl border border-sky-100 bg-white p-3 shadow-sm">
        <QRCodeSVG
          value={url}
          size={220}
          level="M"
          marginSize={2}
          title="QR code for player check-in"
          className={`h-auto max-w-full rounded-xl transition-opacity ${settings.is_open ? "" : "opacity-25"}`}
        />
        {!settings.is_open && (
          <p className="absolute inset-0 flex items-center justify-center px-10 text-center text-sm font-semibold text-slate-700">
            Open check-in so players can join
          </p>
        )}
      </div>

      <p className="w-full break-all rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center text-xs text-slate-600">{url}</p>

      <div className="flex w-full gap-2">
        <button
          type="button"
          onClick={() => void copyLink()}
          className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
        >
          Copy link
        </button>
        <button
          type="button"
          onClick={() => setConfirmNewCode(true)}
          className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
        >
          New code
        </button>
      </div>
      <p className="text-center text-xs text-slate-500">
        Close check-in when everyone has arrived. Players are billed the court fee when they join.
      </p>

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
