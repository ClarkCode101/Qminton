import type { MySignup } from "@/services/signups";

// Players this phone checked in on a live session (per link), with the secret
// code that lets it leave the queue later. The page sends the codes to
// get_signup, which says which of them are still in the queue: so after a
// refresh it shows "You're in" (not the form again), and a player the
// organizer removed disappears.
// Forgotten after 12 hours: the same queue may be used again another day.
const key = (token: string) => `qminton:check-ins:${token}`;
export const MY_CHECK_INS_TTL_MS = 12 * 60 * 60 * 1000;

interface SavedCheckIn extends MySignup {
  at: number;
}

function readSaved(token: string): SavedCheckIn[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key(token)) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is SavedCheckIn =>
            typeof item?.name === "string" && typeof item?.code === "string" && typeof item?.at === "number",
        )
      : [];
  } catch {
    // Private mode / blocked storage / bad data: as if nothing was saved.
    return [];
  }
}

function write(token: string, items: SavedCheckIn[]): void {
  try {
    if (items.length === 0) window.localStorage.removeItem(key(token));
    else window.localStorage.setItem(key(token), JSON.stringify(items));
  } catch {
    // Not remembered: the phone shows the form again after a refresh.
  }
}

export function readMyCheckIns(token: string, now: number = Date.now()): MySignup[] {
  return readSaved(token)
    .filter((item) => now - item.at < MY_CHECK_INS_TTL_MS)
    .map(({ name, code }) => ({ name, code }));
}

export function addMyCheckIn(token: string, checkIn: MySignup, now: number = Date.now()): MySignup[] {
  const kept = readSaved(token).filter((item) => now - item.at < MY_CHECK_INS_TTL_MS);
  write(token, [...kept, { ...checkIn, at: now }]);
  return readMyCheckIns(token, now);
}

export function removeMyCheckIn(token: string, code: string): MySignup[] {
  write(
    token,
    readSaved(token).filter((item) => item.code !== code),
  );
  return readMyCheckIns(token);
}
