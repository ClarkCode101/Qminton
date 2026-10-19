export type NavTab = "courts" | "players" | "billing";

export const NAV_TABS: { id: NavTab; label: string }[] = [
  { id: "courts", label: "Courts" },
  { id: "players", label: "Players" },
  { id: "billing", label: "Billing" },
];
