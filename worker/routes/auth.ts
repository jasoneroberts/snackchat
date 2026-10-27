import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppContext, Env } from "../env";
import { hashPassword, newId, randomToken, sha256, verifyPassword } from "../lib/crypto";
import { sendEmail } from "../lib/email";
import { pingAdmins } from "../lib/notify";
import { createSession, destroySession } from "../lib/session";
import { placeholderEmail, quickSignInOn, validateQuickSignIn } from "../lib/quickSignIn";
import { verifyTurnstile } from "../lib/turnstile";
import { validateSignUp } from "../lib/validation";
import { badWordError } from "../../shared/badWords";

const VERIFY_TOKEN_HOURS = 24;
const now = () => Math.floor(Date.now() / 1000);

export const auth = new Hono<AppContext>();

// Routes that guess-the-password or spam-sign-up bots would hammer are rate
// limited per IP address before any work is done.
const limitByIp = createMiddleware<AppContext>(async (c, next) => {
  const ip = c.req.header("cf-connecting-ip") ?? "local";
  const { success } = await c.env.AUTH_LIMITER.limit({ key: `auth:${ip}` });
  if (!success) return c.json({ error: "Too many attempts. Wait a minute and try again." }, 429);
  await next();
});
auth.use("/signup", limitByIp);
auth.use("/login", limitByIp);
auth.use("/resend-verification", limitByIp);
auth.use("/quick", limitByIp);

auth.post("/signup", async (c) => {
  const parsed = validateSignUp(await c.req.json().catch(() => null));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const input = parsed.value;

  if (!(await verifyTurnstile(c.env.TURNSTILE_SECRET_KEY, input.turnstileToken, c.req.header("cf-connecting-ip") ?? null))) {
    return c.json({ error: "The bot check didn't pass. Please try again." }, 400);
  }

  const db = c.env.DB;
  const taken = await db
    .prepare("SELECT username, email FROM users WHERE username = ? OR email = ? LIMIT 1")
    .bind(input.username, input.email)
    .first<{ username: string; email: string }>();
  if (taken) {
    const field = taken.email.toLowerCase() === input.email ? "email address" : "username";
    return c.json({ error: `That ${field} is already taken.` }, 409);
  }

  // Use up one invite. The WHERE clause makes this atomic: two people cannot
  // both take the last use of a code.
  const claimed = await db
    .prepare(
      `UPDATE invite_codes SET uses = uses + 1
        WHERE code = ? AND uses < max_uses AND (expires_at IS NULL OR expires_at > ?)`,
    )
    .bind(input.inviteCode, now())
    .run();
  if (claimed.meta.changes !== 1) return c.json({ error: "That invite code isn't valid or has been used up." }, 400);

  const userId = newId();
  try {
    await db
      .prepare("INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(userId, input.username, input.email, await hashPassword(input.password), now())
      .run();
  } catch (err) {
    // Most likely someone took the same name a moment ago: give the invite back.
    await db.prepare("UPDATE invite_codes SET uses = uses - 1 WHERE code = ?").bind(input.inviteCode).run();
    console.error("signup insert failed", err);
    return c.json({ error: "That username or email address is already taken." }, 409);
  }

  await sendVerificationEmail(c.env, new URL(c.req.url).origin, userId, input.email);
  await createSession(c, userId);
  pingAdmins(c, newPerson(input.username));
  return c.json({ ok: true }, 201);
});

const newPerson = (username: string) => ({
  kind: "user" as const,
  title: "New person",
  body: `${username} just joined Crunchd.`,
  url: "/admin/users",
});

// Quick sign-in for testing with friends: a name and a PIN.
// - A new name makes an account, using up one invite code.
// - An existing name signs in with its PIN.
// - An existing account with no password or PIN yet (the old dev-login
//   account) is claimed by the first person to set a PIN for it, which also
//   needs a valid invite code.
auth.post("/quick", async (c) => {
  if (!quickSignInOn(c.env)) return c.json({ error: "Not found" }, 404);
  const parsed = validateQuickSignIn(await c.req.json().catch(() => null));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { username, pin, inviteCode } = parsed.value;
  const db = c.env.DB;

  const user = await db
    .prepare("SELECT id, password_hash FROM users WHERE username = ?")
    .bind(username)
    .first<{ id: string; password_hash: string | null }>();

  if (user?.password_hash) {
    if (!(await verifyPassword(pin, user.password_hash))) return c.json({ error: "Wrong name or PIN." }, 401);
    await createSession(c, user.id);
    return c.json({ ok: true, created: false });
  }

  if (!inviteCode) {
    return c.json({ error: user ? "Enter the invite code to set your PIN." : "New here? Enter your invite code." }, 400);
  }

  if (user) {
    const valid = await db
      .prepare("SELECT 1 FROM invite_codes WHERE code = ? AND (expires_at IS NULL OR expires_at > ?)")
      .bind(inviteCode, now())
      .first();
    if (!valid) return c.json({ error: "That invite code isn't valid." }, 400);
    // "password_hash IS NULL" stops two people claiming the same account at once.
    const claimed = await db
      .prepare("UPDATE users SET password_hash = ? WHERE id = ? AND password_hash IS NULL")
      .bind(await hashPassword(pin), user.id)
      .run();
    if (claimed.meta.changes !== 1) return c.json({ error: "Wrong name or PIN." }, 401);
    await createSession(c, user.id);
    return c.json({ ok: true, created: false });
  }

  // A new account. (Existing names are left alone above, so nobody gets locked out.)
  const rude = badWordError({ name: username });
  if (rude) return c.json({ error: rude }, 400);

  // Use up one invite, the same way as the full sign-up.
  const used = await db
    .prepare(
      `UPDATE invite_codes SET uses = uses + 1
        WHERE code = ? AND uses < max_uses AND (expires_at IS NULL OR expires_at > ?)`,
    )
    .bind(inviteCode, now())
    .run();
  if (used.meta.changes !== 1) return c.json({ error: "That invite code isn't valid or has been used up." }, 400);

  const userId = newId();
  try {
    await db
      .prepare(
        `INSERT INTO users (id, username, email, password_hash, email_verified, created_at)
         VALUES (?, ?, ?, ?, 1, ?)`,
      )
      .bind(userId, username, placeholderEmail(username), await hashPassword(pin), now())
      .run();
  } catch (err) {
    await db.prepare("UPDATE invite_codes SET uses = uses - 1 WHERE code = ?").bind(inviteCode).run();
    console.error("quick sign-in insert failed", err);
    return c.json({ error: "That name was just taken. Try another." }, 409);
  }
  await createSession(c, userId);
  pingAdmins(c, newPerson(username));
  return c.json({ ok: true, created: true }, 201);
});

auth.post("/login", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!(await verifyTurnstile(c.env.TURNSTILE_SECRET_KEY, body.turnstileToken, c.req.header("cf-connecting-ip") ?? null))) {
    return c.json({ error: "The bot check didn't pass. Please try again." }, 400);
  }

  const user = await c.env.DB.prepare("SELECT id, password_hash FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; password_hash: string | null }>();
  // Same message whether the email or the password was wrong, so the form
  // can't be used to find out who has an account.
  if (!user?.password_hash || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: "Wrong email or password." }, 401);
  }

  await createSession(c, user.id);
  return c.json({ ok: true });
});

auth.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

// The link in the verification email lands here.
auth.get("/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.redirect("/?verified=0");
  const tokenHash = await sha256(token);
  const row = await c.env.DB.prepare(
    "SELECT user_id FROM email_tokens WHERE token_hash = ? AND purpose = 'verify' AND expires_at > ?",
  )
    .bind(tokenHash, now())
    .first<{ user_id: string }>();
  if (!row) return c.redirect("/?verified=0");

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(row.user_id),
    c.env.DB.prepare("DELETE FROM email_tokens WHERE user_id = ? AND purpose = 'verify'").bind(row.user_id),
  ]);
  return c.redirect("/?verified=1");
});

auth.post("/resend-verification", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Log in first." }, 401);
  if (user.email_verified) return c.json({ ok: true });
  await sendVerificationEmail(c.env, new URL(c.req.url).origin, user.id, user.email);
  return c.json({ ok: true });
});

async function sendVerificationEmail(env: Env, origin: string, userId: string, email: string): Promise<void> {
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM email_tokens WHERE user_id = ? AND purpose = 'verify'").bind(userId),
    env.DB.prepare("INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, 'verify', ?)").bind(
      await sha256(token),
      userId,
      now() + VERIFY_TOKEN_HOURS * 60 * 60,
    ),
  ]);
  const link = `${origin}/api/auth/verify?token=${encodeURIComponent(token)}`;
  await sendEmail(env, {
    to: email,
    subject: `Confirm your ${env.APP_NAME} email`,
    text: `Welcome to ${env.APP_NAME}!\n\nConfirm your email address to start logging snacks:\n${link}\n\nThis link expires in ${VERIFY_TOKEN_HOURS} hours. If you didn't sign up, ignore this email.`,
  });
}
