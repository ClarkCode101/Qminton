import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Link } from "react-router";

import { OverlayPanel } from "@/components/overlay-panel";
import { useToast } from "@/hooks/use-toast";
import { getQueueDisplayPath, getQueueDisplayUrl } from "@/lib/routes";

// QR code of the public display link (owner's addition in step 11): players
// scan it to follow the courts on their phone. Opened from the organizer's More
// menu, not shown on the display itself (owner, 2026-10-21). It only opens the
// display (view only); joining uses the separate join QR.

export function DisplayQrCode({ queueId, size }: { queueId: string; size: number }) {
  return (
    <QRCodeSVG
      value={getQueueDisplayUrl(queueId)}
      size={size}
      level="M"
      marginSize={2}
      title="QR code for the live display"
      className="h-auto max-w-full rounded-xl bg-white"
    />
  );
}

// Big QR in a dialog, opened from the organizer's More menu.
export function DisplayQrDialog({ queueId, queueName, onClose }: { queueId: string; queueName?: string; onClose: () => void }) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const url = getQueueDisplayUrl(queueId);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast("Display link copied", "success");
    } catch {
      showToast("Failed to copy the link", "error");
    }
  };

  return (
    <OverlayPanel
      eyebrow="Live Player Display"
      title="Scan to follow the courts"
      description={queueName ? `Players can open ${queueName} on their phone. No login needed.` : "No login needed."}
      maxWidthClassName="max-w-md"
      onClose={onClose}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-3xl border border-sky-100 bg-white p-3 shadow-sm">
          <DisplayQrCode queueId={queueId} size={280} />
        </div>
        <p className="w-full break-all rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs text-slate-600">{url}</p>
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void copyLink()}
            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
          >
            {copied ? "Link copied" : "Copy link"}
          </button>
          <Link
            to={getQueueDisplayPath(queueId)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Open display
          </Link>
        </div>
      </div>
    </OverlayPanel>
  );
}
