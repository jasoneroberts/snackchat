import { cleanInviter, cleanRef } from "../../shared/ref";

// Remembers the ?ref= from the first link someone opened on this phone, so
// it can go with their sign-up even if they look around first. The first
// one wins: tapping a friend's share later doesn't overwrite the pub sticker.
//
// The same goes for ?by=, the friend whose invite link it was: that friend
// earns points when this person joins (worker/lib/referrals.ts).

const KEY = "crunchd.ref";
const BY_KEY = "crunchd.by";
// Every name that has signed in on this phone. A link from one of them is
// someone inviting themselves, so it's dropped at sign-up.
const ACCOUNTS_KEY = "crunchd.accounts";

/** Call once when the app starts. */
export function rememberRef() {
  const params = new URLSearchParams(window.location.search);
  const ref = cleanRef(params.get("ref"));
  const by = cleanInviter(params.get("by"));
  try {
    if (ref && !localStorage.getItem(KEY)) localStorage.setItem(KEY, ref);
    if (by && !localStorage.getItem(BY_KEY)) localStorage.setItem(BY_KEY, by);
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

/** The friend whose invite link brought this phone here, unless it's someone who has signed in on it. */
export function signupInviter(): string | null {
  const fromUrl = cleanInviter(new URLSearchParams(window.location.search).get("by"));
  try {
    const by = cleanInviter(localStorage.getItem(BY_KEY)) ?? fromUrl;
    if (!by) return null;
    const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "[]") as unknown;
    const own = Array.isArray(accounts) && accounts.some((a) => typeof a === "string" && a.toLowerCase() === by.toLowerCase());
    return own ? null : by;
  } catch {
    return fromUrl;
  }
}

let signedInAs: string | null = null;

/** Call whenever we know who's signed in: notes the name on this phone, and for invite links. */
export function rememberAccount(username: string) {
  signedInAs = username;
  try {
    const list = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "[]") as unknown;
    const names = Array.isArray(list) ? list.filter((a): a is string => typeof a === "string") : [];
    if (!names.includes(username)) localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...names, username].slice(-10)));
  } catch {
    // Storage blocked: the server-side caps still apply.
  }
}

/**
 * Add "by=<you>" to a link you're sharing, so you get the invite points if
 * someone joins from it. `url` is a full link, with or without a ?ref=.
 */
export function withInviter(url: string, username = signedInAs): string {
  if (!username) return url;
  const u = new URL(url);
  u.searchParams.set("by", username);
  return u.toString();
}

/** Your personal invite link: getcrunchd.com/?ref=friend&by=you. */
export const personalInviteLink = (username: string) => withInviter(`${window.location.origin}/?ref=friend`, username);
