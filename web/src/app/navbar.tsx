import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";

import { NAV_TABS, type NavTab } from "@/app/nav-tabs";
import { useSignOut } from "@/features/auth/use-sign-out";
import { DisplayQrDialog } from "@/features/display/display-qr";
import { CreateQueueDialog, DeleteQueueDialog } from "@/features/queues/queue-dialogs";
import { QueueSwitcherPanel } from "@/features/queues/queue-switcher-panel";
import { getQueueDisplayPath, getQueuePath } from "@/lib/routes";

interface Props {
  // null on the empty home workspace and on the landing page (no queue open).
  queueId: string | null;
  // Leave both out on pages without tabs (landing): a "All Queues" label shows instead.
  activeTab?: NavTab;
  onTabChange?: (tab: NavTab) => void;
}

// Icon with its name under it ("Queues", "More"): clear on touch screens too,
// where a hover label never shows.
const iconButtonClass = (isOpen: boolean) =>
  `inline-flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border text-[11px] font-semibold leading-none transition-colors cursor-pointer sm:w-14 ${
    isOpen
      ? "border-sky-200 bg-sky-50 text-blue-600"
      : "border-transparent bg-white text-slate-500 hover:border-sky-100 hover:text-blue-600"
  }`;

function ShortcutIcon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sky-100 bg-sky-50/70 text-sky-700">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        {children}
      </svg>
    </span>
  );
}

function ShortcutText({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block">{title}</span>
      <span className="mt-0.5 block text-xs font-medium text-slate-500">{subtitle}</span>
    </span>
  );
}

const shortcutRowClass =
  "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer";

// Floating bottom navbar (ported from the old Navbar): queue list, tabs, shortcuts.
// New in Qminton: "Log out" in Shortcuts, because there is now a login, and
// "Display QR" (owner's addition in step 11) so players can follow on their phones.
export function Navbar({ queueId, activeTab, onTabChange }: Props) {
  const navigate = useNavigate();
  const { signOut, isSigningOut } = useSignOut();
  const [showQueueList, setShowQueueList] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showNewQueue, setShowNewQueue] = useState(false);
  const [showDisplayQr, setShowDisplayQr] = useState(false);
  const [queuePendingDeletion, setQueuePendingDeletion] = useState<{ id: string; name: string } | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);

  const closePopups = () => {
    setShowQueueList(false);
    setShowShortcuts(false);
  };

  // Click outside or press Escape: close the popups.
  useEffect(() => {
    if (!showQueueList && !showShortcuts) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!navRef.current?.contains(event.target as Node)) closePopups();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePopups();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showQueueList, showShortcuts]);

  const openQueue = (nextQueueId: string) => {
    closePopups();
    navigate(getQueuePath(nextQueueId));
  };

  const handleQueueDeleted = (deletedQueueId: string) => {
    // Deleting the queue you're looking at sends you home, like the old app.
    if (deletedQueueId === queueId) {
      closePopups();
      navigate("/");
    }
  };

  return (
    <>
      {queuePendingDeletion && (
        <DeleteQueueDialog
          queue={queuePendingDeletion}
          onClose={() => setQueuePendingDeletion(null)}
          onDeleted={() => handleQueueDeleted(queuePendingDeletion.id)}
        />
      )}

      {showDisplayQr && queueId && <DisplayQrDialog queueId={queueId} onClose={() => setShowDisplayQr(false)} />}

      {showNewQueue && (
        <CreateQueueDialog
          onClose={() => {
            setShowNewQueue(false);
            closePopups();
          }}
        />
      )}

      <nav className="app-bottom-nav fixed inset-x-0 z-40 px-4 sm:px-6" aria-label="Main">
        <div className="flex justify-center">
          <div
            ref={navRef}
            className="relative flex w-full max-w-[calc(100vw-2rem)] items-center gap-2 rounded-[26px] border border-sky-200 bg-white/92 px-2 py-2 shadow-[0_12px_28px_rgba(14,116,144,0.14)] backdrop-blur-md sm:inline-flex sm:w-auto"
          >
            <button
              type="button"
              onClick={() => {
                setShowShortcuts(false);
                setShowQueueList((current) => !current);
              }}
              className={iconButtonClass(showQueueList)}
              aria-label="Queues: show queue list"
              aria-expanded={showQueueList}
              aria-haspopup="menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h11.25M8.25 12h11.25M8.25 17.25h11.25M4.5 6.75h.008v.008H4.5V6.75ZM4.5 12h.008v.008H4.5V12ZM4.5 17.25h.008v.008H4.5v-.008Z" />
              </svg>
              <span aria-hidden="true">Queues</span>
            </button>

            {showQueueList && (
              <QueueSwitcherPanel
                currentQueueId={queueId}
                onOpenQueue={openQueue}
                onNewQueue={() => setShowNewQueue(true)}
                onDeleteQueue={setQueuePendingDeletion}
              />
            )}

            <div className="min-w-0 flex-1 overflow-x-auto sm:flex-none">
              {activeTab && onTabChange ? (
                <div className="flex min-w-max items-center gap-1 rounded-full bg-slate-100 p-1">
                  {NAV_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => onTabChange(tab.id)}
                      aria-current={activeTab === tab.id ? "page" : undefined}
                      className={`rounded-full px-2.5 py-1.5 text-sm font-semibold transition-all cursor-pointer sm:px-3.5 ${
                        activeTab === tab.id ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              ) : (
                // Plain page title, styled so it doesn't look like a tab you can tap.
                <p className="px-3 text-center text-sm font-semibold text-slate-600">All Queues</p>
              )}
            </div>

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowQueueList(false);
                  setShowShortcuts((current) => !current);
                }}
                className={iconButtonClass(showShortcuts)}
                aria-label="More: open shortcuts"
                aria-expanded={showShortcuts}
                aria-haspopup="menu"
              >
                {/* "⋯" = more options, the same symbol as the other menus in the app. */}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <circle cx="4.5" cy="10" r="1.6" />
                  <circle cx="10" cy="10" r="1.6" />
                  <circle cx="15.5" cy="10" r="1.6" />
                </svg>
                <span aria-hidden="true">More</span>
              </button>

              {showShortcuts && (
                <div className="queue-list-panel absolute bottom-[calc(100%+0.75rem)] right-0 z-50 w-56 overflow-hidden rounded-3xl border border-sky-200 bg-white shadow-[0_20px_40px_rgba(14,116,144,0.16)]">
                  <div className="border-b border-sky-100 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">More</p>
                    <p className="mt-0.5 text-[13px] leading-5 text-slate-500">Open another view for this workspace.</p>
                  </div>

                  <div className="p-2">
                    <Link to="/landing" onClick={() => setShowShortcuts(false)} className={shortcutRowClass}>
                      <ShortcutIcon>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5v13.5H3.75z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 9h9M7.5 12h6M7.5 15h4.5" />
                      </ShortcutIcon>
                      <ShortcutText title="Landing" subtitle="Open the launcher deck" />
                    </Link>

                    {queueId && (
                      <Link
                        to={getQueueDisplayPath(queueId)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setShowShortcuts(false)}
                        className={shortcutRowClass}
                      >
                        <ShortcutIcon>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.75A2.25 2.25 0 0 1 6.75 4.5h10.5A2.25 2.25 0 0 1 19.5 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 17.25V6.75Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="m9 15 6-6M10.5 9H15v4.5" />
                        </ShortcutIcon>
                        <ShortcutText title="Display" subtitle="Open the public display screen" />
                      </Link>
                    )}

                    {queueId && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowShortcuts(false);
                          setShowDisplayQr(true);
                        }}
                        className={shortcutRowClass}
                      >
                        <ShortcutIcon>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75h6v6h-6v-6Zm10.5 0h6v6h-6v-6Zm-10.5 10.5h6v6h-6v-6Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 14.25h2.25v2.25h-2.25zM18 18h2.25v2.25H18zM18 14.25h2.25M14.25 18v2.25" />
                        </ShortcutIcon>
                        <ShortcutText title="Display QR" subtitle="Let players scan the display" />
                      </button>
                    )}

                    <button type="button" onClick={() => void signOut()} disabled={isSigningOut} className={shortcutRowClass}>
                      <ShortcutIcon>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
                      </ShortcutIcon>
                      <ShortcutText title={isSigningOut ? "Logging out…" : "Log out"} subtitle="Sign out of this device" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
