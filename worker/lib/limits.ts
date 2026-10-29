// Limits that stop one account (or a script using it) flooding the app.
//
// - A burst limit: WRITE_LIMIT changes a minute per person, across
//   everything that isn't a read. Counted by Cloudflare's rate limiter
//   (the WRITE_LIMITER binding in wrangler.jsonc).
// - Daily limits on the things that cost the most or reach other people:
//   check-ins (with their photos), new snacks and reports. Counted from the
//   database over the last 24 hours, so they need no extra storage.
//
// Admins skip both: loading demo data alone makes dozens of calls.

import type { Context } from "hono";
import type { AppContext } from "../env";

export const WRITE_LIMIT = 30; // per minute, set in wrangler.jsonc too

export const DAILY_LIMITS = {
  checkins: { max: 40, sql: "SELECT COUNT(*) AS n FROM checkins WHERE user_id = ?1 AND created_at > ?2", what: "check-ins" },
  snacks: { max: 10, sql: "SELECT COUNT(*) AS n FROM snacks WHERE created_by = ?1 AND created_at > ?2", what: "new snacks" },
  reports: { max: 20, sql: "SELECT COUNT(*) AS n FROM reports WHERE reporter_id = ?1 AND created_at > ?2", what: "reports" },
} as const;

export type DailyLimit = keyof typeof DAILY_LIMITS;

/** The message when someone hits a daily limit. */
export const dailyLimitError = (kind: DailyLimit) =>
  `That's the most ${DAILY_LIMITS[kind].what} anyone can add in a day (${DAILY_LIMITS[kind].max}). Try again tomorrow.`;

/**
 * Returns an error message if this person has used up today's allowance,
 * or null if they can go ahead.
 */
export async function overDailyLimit(c: Context<AppContext>, kind: DailyLimit): Promise<string | null> {
  const user = c.get("user");
  if (!user || user.is_admin === 1) return null;
  const limit = DAILY_LIMITS[kind];
  const since = Math.floor(Date.now() / 1000) - 86400;
  const n = await c.env.DB.prepare(limit.sql).bind(user.id, since).first<number>("n");
  return (n ?? 0) >= limit.max ? dailyLimitError(kind) : null;
}

/** Whether a request changes something (and so counts towards the burst limit). */
export const isWrite = (method: string) => !["GET", "HEAD", "OPTIONS"].includes(method);
