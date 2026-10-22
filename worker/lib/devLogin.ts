import type { Context } from "hono";
import type { AppContext, User } from "../env";
import { newId } from "./crypto";

/**
 * Internal-development shortcut. When the DEV_LOGIN_AS variable names a
 * username, anyone who opens the app without a session is treated as that
 * user, so there is no sign-up or log-in to get through. The user is created
 * on first use with no password, which means it can never log in normally.
 *
 * Remove DEV_LOGIN_AS from wrangler.jsonc before sharing the app.
 */
export function devLoginUsername(env: AppContext["Bindings"]): string | null {
  const name = env.DEV_LOGIN_AS?.trim();
  return name ? name : null;
}

export async function getDevUser(c: Context<AppContext>, username: string): Promise<User> {
  const select = c.env.DB.prepare(
    "SELECT id, username, email, email_verified, country, is_admin FROM users WHERE username = ?",
  ).bind(username);

  const existing = await select.first<User>();
  if (existing) return existing;

  // INSERT OR IGNORE: two first requests arriving together both end up with the same row.
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, username, email, password_hash, email_verified, is_admin, created_at)
     VALUES (?, ?, ?, NULL, 1, 1, ?)`,
  )
    .bind(newId(), username, `${username.toLowerCase()}@dev.snackchat.invalid`, Math.floor(Date.now() / 1000))
    .run();

  const created = await select.first<User>();
  if (!created) throw new Error(`Could not create dev user ${username}`);
  return created;
}
