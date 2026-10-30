import { cleanRef } from "../../shared/ref";

// Remembers the ?ref= from the first link someone opened on this phone, so
// it can go with their sign-up even if they look around first. The first
// one wins: tapping a friend's share later doesn't overwrite the pub sticker.

const KEY = "crunchd.ref";

/** Call once when the app starts. */
export function rememberRef() {
  const ref = cleanRef(new URLSearchParams(window.location.search).get("ref"));
  try {
    if (ref && !localStorage.getItem(KEY)) localStorage.setItem(KEY, ref);
  } catch {
    // Private browsing can block storage; they'll show as "no link".
  }
}

/** The remembered ref, sent with sign-up. A squad invite link counts as "squad" if nothing else was saved. */
export function signupRef(): string | null {
  try {
    const saved = cleanRef(localStorage.getItem(KEY));
    if (saved) return saved;
  } catch {
    // fall through
  }
  return window.location.pathname.startsWith("/join/") ? "squad" : null;
}
