// Rules for quick sign-in: a username and a short PIN, no email. Anyone can
// make an account (after the Turnstile bot check); after that the name and
// PIN get them back in. Wrong PINs are limited per name (lib/pinLock.ts).

import { cleanInviter, cleanRef } from "../../shared/ref";
import { USERNAME_RE } from "./validation";

export const PIN_RE = /^\d{4,8}$/;

export interface QuickSignInInput {
  username: string;
  pin: string;
  turnstileToken: string; // only checked when making a new account
  ref: string | null; // where a new person came from (shared/ref.ts)
  inviter: string | null; // whose invite link they used, if any (worker/lib/referrals.ts)
}

export function quickSignInOn(env: { QUICK_SIGNIN?: string }): boolean {
  return env.QUICK_SIGNIN === "on";
}

export function validateQuickSignIn(body: unknown): { ok: true; value: QuickSignInInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  // "sam dale" becomes sam_dale: spaces are the commonest reason a name is refused.
  const username = typeof b.username === "string" ? b.username.trim().replace(/\s+/g, "_") : "";
  const pin = typeof b.pin === "string" ? b.pin.trim() : "";
  const turnstileToken = typeof b.turnstileToken === "string" ? b.turnstileToken : "";
  if (!USERNAME_RE.test(username)) return { ok: false, error: "Names are 3 to 20 letters or numbers, with _ instead of spaces (like sam_k)." };
  if (!PIN_RE.test(pin)) return { ok: false, error: "PINs are 4 to 8 digits." };
  return { ok: true, value: { username, pin, turnstileToken, ref: cleanRef(b.ref), inviter: cleanInviter(b.invitedBy) } };
}

// PINs people pick so often that a script tries them first. Only new
// accounts (and admin resets) are held to this; nobody already signed up is
// asked to change.
const COMMON_PINS = new Set([
  "1212", "1004", "2000", "2001", "6969", "1122", "1313", "2580", "0852", "1010",
  "2468", "1357", "1230", "0007", "4200", "1112", "1121", "2112", "7410", "0147",
  "123123", "121212", "112233", "696969", "101010",
]);

/** True for PINs a guesser would try first: one digit repeated, a straight run up or down, or a well-known one. */
export function isCommonPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true; // 0000, 777777
  const digits = [...pin].map(Number);
  const steps = new Set(digits.slice(1).map((d, i) => d - digits[i]));
  if (steps.size === 1 && (steps.has(1) || steps.has(-1))) return true; // 1234, 4321, 23456789
  return COMMON_PINS.has(pin);
}

export const COMMON_PIN_ERROR = "That's one of the first PINs people guess. Pick another.";

/** Quick accounts have no real email address; this placeholder keeps the column unique. */
export const placeholderEmail = (username: string) => `${username.toLowerCase()}@quick.snackchat.invalid`;

/** A random 6-digit PIN for an admin reset, e.g. "048213". */
export function newPin(): string {
  // 1,000,000 doesn't divide 2^32 evenly; redraw the top sliver so every PIN is equally likely.
  const limit = 4_294_000_000;
  const n = new Uint32Array(1);
  let pin: string;
  do {
    do crypto.getRandomValues(n);
    while (n[0] >= limit);
    pin = String(n[0] % 1_000_000).padStart(6, "0");
  } while (isCommonPin(pin));
  return pin;
}
