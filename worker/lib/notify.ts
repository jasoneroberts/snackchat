// Telling admins when something needs them: a new person, a photo or
// profile picture to approve, a report, or a new snack. Each admin phone that
// turned notifications on (Settings > Admin) gets a push message.

import type { Context } from "hono";
import type { AppContext, Env } from "../env";
import { makeVapidKeys, sendPush, type VapidKeys } from "./webpush";

export type AdminEventKind = "user" | "photo" | "report" | "snack";

export interface AdminEvent {
  kind: AdminEventKind;
  title: string;
  body: string;
  url: string; // the page in the app to open when the notification is tapped
}

/**
 * The server's push signing key. Made the first time it's needed and kept in
 * the database, so it survives deploys. INSERT OR IGNORE then read back
 * means two requests racing to make it still agree on one key.
 */
export async function vapidKeys(db: D1Database): Promise<VapidKeys> {
  const read = () => db.prepare("SELECT value FROM app_keys WHERE name = 'vapid'").first<{ value: string }>();
  let row = await read();
  if (!row) {
    await db.prepare("INSERT OR IGNORE INTO app_keys (name, value) VALUES ('vapid', ?)").bind(JSON.stringify(await makeVapidKeys())).run();
    row = await read();
  }
  return JSON.parse(row!.value) as VapidKeys;
}

/**
 * Push one event to every admin's phones, except the person who caused it
 * (an admin doesn't need telling about their own new snack). Phones that
 * have unsubscribed are tidied away. Never throws: a failed notification
 * mustn't break the thing that triggered it.
 */
export async function notifyAdmins(
  env: Env,
  origin: string,
  event: AdminEvent,
  who: { except?: string; only?: string } = {},
): Promise<number> {
  try {
    const { results } = await env.DB.prepare(
      `SELECT s.endpoint, s.p256dh, s.auth FROM push_subscriptions s JOIN users u ON u.id = s.user_id
        WHERE u.is_admin = 1 AND u.id != ?1 AND (?2 IS NULL OR u.id = ?2)`,
    )
      .bind(who.except ?? "", who.only ?? null)
      .all<{ endpoint: string; p256dh: string; auth: string }>();
    if (!results.length) return 0;

    const keys = await vapidKeys(env.DB);
    const payload = JSON.stringify({ ...event, tag: event.kind });
    let sent = 0;
    for (const target of results) {
      try {
        const status = await sendPush(target, payload, keys, origin);
        if (status === 404 || status === 410) {
          await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(target.endpoint).run();
        } else if (status >= 400) {
          console.warn(`[push] ${status} from ${new URL(target.endpoint).host}`);
        } else sent++;
      } catch (err) {
        console.warn("[push] send failed", err);
      }
    }
    return sent;
  } catch (err) {
    console.error("[push] notifyAdmins failed", err);
    return 0;
  }
}

/** Fire-and-forget from a route: the response doesn't wait for the pushes. */
export function pingAdmins(c: Context<AppContext>, event: AdminEvent, actorId?: string): void {
  const job = notifyAdmins(c.env, new URL(c.req.url).origin, event, { except: actorId });
  try {
    c.executionCtx.waitUntil(job);
  } catch {
    // No execution context (unit tests): the job still runs on its own.
  }
}

// Unread totals for an admin, for the badge on the Me tab.
export async function newUserCount(db: D1Database, adminId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM users
        WHERE id NOT LIKE 'demo-%' AND id != ?1
          AND created_at > IFNULL((SELECT users_seen_at FROM users WHERE id = ?1), unixepoch() - 7 * 86400)`,
    )
    .bind(adminId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
