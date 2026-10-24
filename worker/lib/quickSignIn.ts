// Rules for quick sign-in: a username and a short PIN, no email. It is for
// testing with a few friends; turn it off (QUICK_SIGNIN) for a real launch.

import { USERNAME_RE } from "./validation";

export const PIN_RE = /^\d{4,8}$/;

export interface QuickSignInInput {
  username: string;
  pin: string;
  inviteCode: string; // only needed to create an account
}

export function quickSignInOn(env: { QUICK_SIGNIN?: string }): boolean {
  return env.QUICK_SIGNIN === "on";
}

export function validateQuickSignIn(body: unknown): { ok: true; value: QuickSignInInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const username = typeof b.username === "string" ? b.username.trim() : "";
  const pin = typeof b.pin === "string" ? b.pin.trim() : "";
  const inviteCode = typeof b.inviteCode === "string" ? b.inviteCode.trim() : "";
  if (!USERNAME_RE.test(username)) return { ok: false, error: "Names are 3 to 20 letters, numbers or underscores." };
  if (!PIN_RE.test(pin)) return { ok: false, error: "PINs are 4 to 8 digits." };
  return { ok: true, value: { username, pin, inviteCode } };
}

/** Quick accounts have no real email address; this placeholder keeps the column unique. */
export const placeholderEmail = (username: string) => `${username.toLowerCase()}@quick.snackchat.invalid`;

/** A random 6-digit PIN for an admin reset, e.g. "048213". */
export function newPin(): string {
  // 1,000,000 doesn't divide 2^32 evenly; redraw the top sliver so every PIN is equally likely.
  const limit = 4_294_000_000;
  const n = new Uint32Array(1);
  do crypto.getRandomValues(n);
  while (n[0] >= limit);
  return String(n[0] % 1_000_000).padStart(6, "0");
}
