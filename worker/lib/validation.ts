// Input rules shared by sign-up and log-in.

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SignUpInput {
  username: string;
  email: string;
  password: string;
  inviteCode: string;
  turnstileToken: string;
}

export function validateSignUp(body: unknown): { ok: true; value: SignUpInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const username = typeof b.username === "string" ? b.username.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  const inviteCode = typeof b.inviteCode === "string" ? b.inviteCode.trim() : "";
  const turnstileToken = typeof b.turnstileToken === "string" ? b.turnstileToken : "";

  if (!USERNAME_RE.test(username)) return { ok: false, error: "Usernames are 3 to 20 letters, numbers or underscores." };
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: "That email address doesn't look right." };
  if (password.length < 10) return { ok: false, error: "Passwords need at least 10 characters." };
  if (password.length > 200) return { ok: false, error: "That password is too long." };
  if (!inviteCode) return { ok: false, error: "Snackchat is invite-only for now. Enter your invite code." };
  return { ok: true, value: { username, email, password, inviteCode, turnstileToken } };
}

export interface SnackFields {
  name: string;
  brand: string | null;
  category: string;
}

/**
 * A snack's name, maker and type, as typed when adding a snack or when an
 * admin corrects one. Extra spaces are squashed; a blank maker becomes null.
 */
export function validateSnackFields(
  body: unknown,
  isCategory: (id: string) => boolean,
): { ok: true; value: SnackFields } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
  const brand = typeof b.brand === "string" ? b.brand.trim().replace(/\s+/g, " ") : "";
  const category = typeof b.category === "string" ? b.category : "";
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Snack names are 2 to 80 characters." };
  if (brand.length > 60) return { ok: false, error: "Keep the brand under 60 characters." };
  if (!isCategory(category)) return { ok: false, error: "Pick a snack type." };
  return { ok: true, value: { name, brand: brand || null, category } };
}
