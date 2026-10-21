import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppContext, User } from "../env";
import { randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "sc_session";
const SESSION_DAYS = 30;

const now = () => Math.floor(Date.now() / 1000);

/**
 * Start a session: the browser gets a random token in an HttpOnly cookie
 * (JavaScript on the page cannot read it), and the database stores only its
 * SHA-256 hash.
 */
export async function createSession(c: Context<AppContext>, userId: string): Promise<void> {
  const token = randomToken();
  const expiresAt = now() + SESSION_DAYS * 24 * 60 * 60;
  await c.env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), userId, expiresAt, now())
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/** Look up the signed-in user from the session cookie, or null. */
export async function getSessionUser(c: Context<AppContext>): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return c.env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.email_verified, u.country, u.is_admin
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ?`,
  )
    .bind(await sha256(token), now())
    .first<User>();
}

export async function destroySession(c: Context<AppContext>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}
