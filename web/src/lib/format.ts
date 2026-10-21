import type { GameMode } from "@/services/queues";

// Display helpers shared by several screens (same output as the old app).

// Negative amounts (refunds, undone payments) read "-₱20", like the old app.
export function formatCurrency(amount: number): string {
  return `${amount < 0 ? "-" : ""}₱${Math.abs(amount).toLocaleString("en-PH")}`;
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

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

// "When was this last touched?" in the way people say it:
// "Just now", "5 min ago", "Today, 3:30 PM", "Yesterday, 3:30 PM",
// "Mon, 3:30 PM" (this past week), "Oct 19", or "Oct 19, 2025" (older years).
export function formatRelativeDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const minutesAgo = Math.floor((now.getTime() - date.getTime()) / 60_000);

  if (minutesAgo < 1) return "Just now";
  if (minutesAgo < 60) return `${minutesAgo} min ago`;

  const time = formatTime(iso);
  if (isSameDay(date, now)) return `Today, ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return `Yesterday, ${time}`;

  const sixDaysAgo = new Date(now);
  sixDaysAgo.setDate(now.getDate() - 6);
  sixDaysAgo.setHours(0, 0, 0, 0);
  if (date >= sixDaysAgo) {
    return `${date.toLocaleDateString("en-PH", { weekday: "short" })}, ${time}`;
  }

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

// When a planned session starts: "Sat, Oct 25 · 7:00 PM" (year added when not this year).
export function formatSessionDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
  return `${day} · ${formatTime(iso)}`;
}

// "Ma. Clara Reyes" -> "MC", "Ben" -> "B".
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

// ISO time -> the "YYYY-MM-DDTHH:mm" text a datetime-local input shows (local time).
export function toDateTimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function pluralizePlayer(count: number): string {
  return `${count} player${count !== 1 ? "s" : ""}`;
}

export function gameModeLabel(mode: GameMode): string {
  return mode === "doubles" ? "Doubles" : "Singles";
}
