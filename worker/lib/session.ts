import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppContext, User } from "../env";
import { randomToken, sha256 } from "./crypto";
import { inBackground } from "./notify";

export const SESSION_COOKIE = "sc_session";
// Sessions last SESSION_DAYS and are pushed back to SESSION_DAYS whenever
// someone uses the app with less than RENEW_BELOW_DAYS left. So anyone who
// opens Crunchd at least every six months never has to type their PIN again,
// and the renewal costs one small write about once a month per person.
// (Sessions made before this rule had 30 days; the first visit renews them.)
export const SESSION_DAYS = 180;
export const RENEW_BELOW_DAYS = 150;
const DAY = 24 * 60 * 60;

const now = () => Math.floor(Date.now() / 1000);

/**
 * Start a session: the browser gets a random token in an HttpOnly cookie
 * (JavaScript on the page cannot read it), and the database stores only its
 * SHA-256 hash.
 */
export async function createSession(c: Context<AppContext>, userId: string): Promise<void> {
  const token = randomToken();
  const expiresAt = now() + SESSION_DAYS * DAY;
  await c.env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), userId, expiresAt, now())
    .run();
  setSessionCookie(c, token);
}

function setSessionCookie(c: Context<AppContext>, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * DAY,
  });
}

/** Whether a session ending at expiresAt should be pushed back now. */
export const needsRenewal = (expiresAt: number, at: number) => expiresAt - at < RENEW_BELOW_DAYS * DAY;

/** Look up the signed-in user from the session cookie, or null. */
export async function getSessionUser(c: Context<AppContext>): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const id = await sha256(token);
  const at = now();
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.email_verified, u.country, u.is_admin, u.avatar_id, u.avatar_pending_id, u.voice,
            s.expires_at AS session_expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ?`,
  )
    .bind(id, at)
    .first<User & { session_expires_at: number }>();
  if (!row) return null;
  const { session_expires_at, ...user } = row;
  if (needsRenewal(session_expires_at, at)) {
    // The write runs after the response, so it never slows the request down.
    inBackground(c, c.env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").bind(at + SESSION_DAYS * DAY, id).run());
    setSessionCookie(c, token);
  }
  return user;
}

export async function destroySession(c: Context<AppContext>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}
