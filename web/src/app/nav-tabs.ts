// The Players tab (old stats table) was removed (owner, 2026-10-21): the
// player list on the Courts tab and the Billing tab cover what it showed.
export type NavTab = "courts" | "billing";

export const NAV_TABS: { id: NavTab; label: string }[] = [
  { id: "courts", label: "Courts" },
  { id: "billing", label: "Billing" },
];
