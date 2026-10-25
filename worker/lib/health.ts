// Errors and alerts. Every crash, on someone's phone or in the Worker, is
// written to error_log so the admin Health page can show it, and the hourly
// check emails the admin when there are suddenly a lot of them.

import type { Env } from "../env";
import { sendEmail } from "./email";

const now = () => Math.floor(Date.now() / 1000);

export interface ErrorEntry {
  source: "client" | "server";
  message: string;
  detail?: string | null;
  path?: string | null;
  userId?: string | null;
  userAgent?: string | null;
}

/** Cut text to a size that's useful to read but can't fill the database. */
export const clip = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

/**
 * Read an error report sent by the app. Returns null for anything that isn't
 * one, so junk posted to the endpoint is ignored rather than stored.
 */
export function readClientError(body: unknown): Pick<ErrorEntry, "message" | "detail" | "path"> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const message = clip(b.message, 500);
  if (!message) return null;
  return { message, detail: clip(b.detail, 4000), path: clip(b.path, 300) };
}

export async function logError(db: D1Database, e: ErrorEntry): Promise<void> {
  await db
    .prepare(
      `INSERT INTO error_log (source, message, detail, path, user_id, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(e.source, e.message.slice(0, 500), e.detail?.slice(0, 4000) ?? null, e.path ?? null, e.userId ?? null, e.userAgent?.slice(0, 300) ?? null, now())
    .run();
}

// More than this many errors in an hour sends an email.
export const ALERT_THRESHOLD = 10;
// After an alert, stay quiet for this long so one bad hour isn't ten emails.
const ALERT_QUIET_SECONDS = 6 * 3600;
const ALERT_KEY = "alert:errors:v1";

/** Should this hour's error count send an alert? */
export const shouldAlert = (errorsLastHour: number, alertedRecently: boolean) =>
  errorsLastHour >= ALERT_THRESHOLD && !alertedRecently;

/**
 * Who gets alerts: ALERT_EMAIL if it's set, otherwise every admin with a real
 * email address (quick sign-in accounts don't have one).
 */
export async function alertRecipients(env: Env): Promise<string[]> {
  if (env.ALERT_EMAIL) return env.ALERT_EMAIL.split(",").map((s) => s.trim()).filter(Boolean);
  const rows = await env.DB.prepare("SELECT email FROM users WHERE is_admin = 1 AND email NOT LIKE '%.invalid'").all<{ email: string }>();
  return rows.results.map((r) => r.email);
}

/** The hourly check: email the admin if errors have spiked. */
export async function checkErrorSpike(env: Env): Promise<{ errors: number; alerted: boolean }> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM error_log WHERE created_at > ?")
    .bind(now() - 3600)
    .first<{ n: number }>();
  const errors = row?.n ?? 0;
  const alertedRecently = (await env.CACHE.get(ALERT_KEY)) !== null;
  if (!shouldAlert(errors, alertedRecently)) return { errors, alerted: false };

  const top = await env.DB.prepare(
    `SELECT message, COUNT(*) AS n FROM error_log WHERE created_at > ?
      GROUP BY message ORDER BY n DESC LIMIT 5`,
  )
    .bind(now() - 3600)
    .all<{ message: string; n: number }>();
  const text = [
    `${env.APP_NAME} had ${errors} errors in the last hour.`,
    "",
    "Most common:",
    ...top.results.map((t) => `  ${t.n} x ${t.message}`),
    "",
    "See them all in Settings > Health. You won't get another alert for 6 hours.",
  ].join("\n");
  for (const to of await alertRecipients(env)) {
    await sendEmail(env, { to, subject: `${env.APP_NAME}: ${errors} errors in the last hour`, text });
  }
  // Logged as well, so the alert shows in the Worker logs even before email is set up.
  console.warn(`[alert] ${errors} errors in the last hour`);
  await env.CACHE.put(ALERT_KEY, String(now()), { expirationTtl: ALERT_QUIET_SECONDS });
  return { errors, alerted: true };
}

// Old errors and admin history are cleared after this many days.
const KEEP_LOG_DAYS = 90;

export async function pruneLogs(db: D1Database): Promise<void> {
  const cutoff = now() - KEEP_LOG_DAYS * 86400;
  await db.batch([
    db.prepare("DELETE FROM error_log WHERE created_at < ?").bind(cutoff),
    db.prepare("DELETE FROM admin_audit_log WHERE created_at < ?").bind(cutoff),
  ]);
}
