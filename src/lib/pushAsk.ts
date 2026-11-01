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

// One more ask for people we'd stopped asking (they said "Not now" three
// times, or turned notifications off in Settings), from when notifications
// became "on by default" in Nov 2026. Set once that ask has been answered,
// so it really is just once.
const ASKED_AGAIN = "crunchd.pushAskedAgain";
// The "notifications are blocked" how-to: shown once, it needs phone settings.
const BLOCKED_SHOWN = "crunchd.pushBlockedShown";
// "Some of your notifications are off": asked once per phone.
const TYPES_ASKED = "crunchd.pushTypesAsked";

/** Should we show the sheet now? `state` is pushState() for this phone. */
export function shouldAskForPush(state: PushState, now = Date.now()): boolean {
  // Only "off" can be fixed with one tap. "blocked" needs phone settings
  // (see shouldShowBlockedHelp), "needs-install" needs the home screen first
  // (the welcome page covers that).
  if (state !== "off") return false;
  const { count, next } = askRecord();
  const stoppedAsking = recall(TURNED_OFF) !== null || count > ASK_GAPS_DAYS.length;
  if (stoppedAsking) return recall(ASKED_AGAIN) === null; // the one comeback ask
  return now >= next;
}

/** Call when they answer the sheet either way, so the comeback ask is used up. */
export function markPushAsked(): void {
  remember(ASKED_AGAIN, "1");
}

/** Blocked in the phone's settings: show how to unblock, once. */
export function shouldShowBlockedHelp(state: PushState): boolean {
  return state === "blocked" && recall(BLOCKED_SHOWN) === null;
}
export function markBlockedHelpShown(): void {
  remember(BLOCKED_SHOWN, "1");
}

/**
 * Notifications are on for this phone but they've switched some kinds off
 * in Settings. `off` is how many kinds are off. Asked once: if they say
 * "Keep as they are", that's their choice and we leave it.
 */
export function shouldAskAboutTypes(state: PushState, off: number): boolean {
  return state === "on" && off > 0 && recall(TYPES_ASKED) === null;
}
export function markTypesAsked(): void {
  remember(TYPES_ASKED, "1");
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

