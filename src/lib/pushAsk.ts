// When to ask about push notifications, and remembering the answers on this
// phone. Kept apart from push.ts (which needs the browser's push APIs) so the
// rules can be unit tested in plain Node.

export type PushState = "unsupported" | "needs-install" | "blocked" | "off" | "on";

interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
const storage = () => (globalThis as { localStorage?: KeyValueStore }).localStorage;

// ---------------------------------------------------------------------------
// Getting as many people as we can to have notifications on.
//
// A website can't switch notifications on by itself: the phone only lets the
// person allow them, with a tap on a button. So we do the next best things:
//  1. keepPushOn() in push.ts: if they've already allowed Crunchd (the permission is
//     "granted") but this phone has no subscription, or the server lost it,
//     quietly (re)subscribe. No tap needed, because the phone already said yes.
//  2. shouldAskForPush(): when to show the "Turn on notifications?" sheet:
//     only when one tap can actually do it, and not too often.

export const TURNED_OFF = "crunchd.pushOff"; // they turned it off in Settings: respect that
const ASK = "crunchd.pushAsk"; // {"count": times they said "Not now", "next": ms when we may ask again}
const ASK_GAPS_DAYS = [2, 7]; // after the 1st "Not now" wait 2 days, after the 2nd a week, after the 3rd stop

export function recall(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null; // storage blocked (private browsing): act as if nothing saved
  }
}

export function remember(key: string, value: string | null): void {
  try {
    if (value === null) storage()?.removeItem(key);
    else storage()?.setItem(key, value);
  } catch {
    // Storage blocked: we'll just ask again next visit.
  }
}

/** Should we show the sheet now? `state` is pushState() for this phone. */
export function shouldAskForPush(state: PushState, now = Date.now()): boolean {
  // Only "off" can be fixed with one tap. "blocked" needs phone settings,
  // "needs-install" needs the home screen first (the welcome page covers that).
  if (state !== "off" || recall(TURNED_OFF)) return false;
  const { count, next } = askRecord();
  return count <= ASK_GAPS_DAYS.length && now >= next;
}

/** They tapped "Not now": back off a bit more each time. */
export function snoozePushAsk(now = Date.now()): void {
  const { count } = askRecord();
  const days = ASK_GAPS_DAYS[count] ?? 0; // past the end: count > gaps, so never asked again
  remember(ASK, JSON.stringify({ count: count + 1, next: now + days * 86_400_000 }));
}

function askRecord(): { count: number; next: number } {
  try {
    const saved = JSON.parse(recall(ASK) ?? "{}") as { count?: unknown; next?: unknown };
    return { count: typeof saved.count === "number" ? saved.count : 0, next: typeof saved.next === "number" ? saved.next : 0 };
  } catch {
    return { count: 0, next: 0 };
  }
}

