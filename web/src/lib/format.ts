import type { GameMode } from "@/services/queues";

// Display helpers shared by several screens (same output as the old app).

export function formatCurrency(amount: number): string {
  return `₱${amount.toLocaleString("en-PH")}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function pluralizePlayer(count: number): string {
  return `${count} player${count !== 1 ? "s" : ""}`;
}

export function gameModeLabel(mode: GameMode): string {
  return mode === "doubles" ? "Doubles" : "Singles";
}
