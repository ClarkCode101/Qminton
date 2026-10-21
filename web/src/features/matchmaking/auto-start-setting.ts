// The Auto-start switch is remembered per device and per queue (owner's choice):
// only the device that presses Finish Game starts the next match, so two
// organizers with the same queue open can't both start one.
const key = (queueId: string) => `qminton:auto-start:${queueId}`;

export function readAutoStart(queueId: string): boolean {
  try {
    return window.localStorage.getItem(key(queueId)) === "on";
  } catch {
    // Private mode / blocked storage: just start switched off.
    return false;
  }
}

export function writeAutoStart(queueId: string, on: boolean): void {
  try {
    if (on) window.localStorage.setItem(key(queueId), "on");
    else window.localStorage.removeItem(key(queueId));
  } catch {
    // Not remembered after a reload, but the switch still works now.
  }
}
