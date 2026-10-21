import type { MySignup } from "@/services/signups";

// The secret codes this phone got when signing up (one link can sign up a
// friend too). Kept per link so "Cancel my spot" works from this phone only.
const key = (token: string) => `qminton:signups:${token}`;

export function readMySignups(token: string): MySignup[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key(token)) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is MySignup => typeof item?.code === "string" && typeof item?.name === "string")
      : [];
  } catch {
    // Private mode / blocked storage / bad data: as if nothing was saved.
    return [];
  }
}

export function writeMySignups(token: string, signups: MySignup[]): void {
  try {
    if (signups.length === 0) window.localStorage.removeItem(key(token));
    else window.localStorage.setItem(key(token), JSON.stringify(signups));
  } catch {
    // Not remembered: the organizer can still remove the spot.
  }
}
