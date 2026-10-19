// What one court card needs. Courts are numbered 1..court_count; a court is
// "occupied" when a started match is on it (see the step-2 schema notes).
export interface CourtView {
  courtNo: number;
  status: "available" | "occupied";
  team1: { id: number; name: string }[];
  team2: { id: number; name: string }[];
  // Real timestamp (old bug #3: "03:15 PM" strings broke across midnight/timezones).
  startedAt: string | null;
}

export function getEmptyCourts(count: number): CourtView[] {
  return Array.from({ length: count }, (_, index) => ({
    courtNo: index + 1,
    status: "available",
    team1: [],
    team2: [],
    startedAt: null,
  }));
}

// "m:ss" since the match started, e.g. "12:05".
export function formatElapsed(startedAt: string | null, now: number): string {
  if (!startedAt) return "";
  const startedMs = Date.parse(startedAt);
  if (Number.isNaN(startedMs)) return "--:--";
  const totalSeconds = Math.max(0, Math.floor((now - startedMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
