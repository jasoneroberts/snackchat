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
