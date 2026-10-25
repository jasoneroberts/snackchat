import { Hono } from "hono";
import type { AuditRow, BackupRow, ErrorRow, HealthSummary } from "../../shared/types";
import type { AppContext } from "../env";
import { BACKUP_PREFIX, isBackupName, runBackup } from "../lib/backup";
import { ALERT_THRESHOLD, alertRecipients } from "../lib/health";

// The admin Health page: recent errors, what admins changed, and backups.
// Mounted inside the admin routes, so only admins get here.
export const health = new Hono<AppContext>();

health.get("/", async (c) => {
  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);
  const [counts, errors, audit, backups, alertsTo] = await Promise.all([
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM error_log WHERE created_at > ?1) AS hour,
                (SELECT COUNT(*) FROM error_log WHERE created_at > ?2) AS day`,
      )
      .bind(now - 3600, now - 86400)
      .first<{ hour: number; day: number }>(),
    db
      .prepare(
        `SELECT e.id, e.source, e.message, e.detail, e.path, u.username, e.user_agent AS userAgent, e.created_at AS createdAt
           FROM error_log e LEFT JOIN users u ON u.id = e.user_id
          ORDER BY e.id DESC LIMIT 50`,
      )
      .all<ErrorRow>(),
    db
      .prepare(
        `SELECT id, admin_name AS adminName, method, path, status, detail, created_at AS createdAt
           FROM admin_audit_log ORDER BY id DESC LIMIT 50`,
      )
      .all<AuditRow>(),
    c.env.PHOTOS.list({ prefix: BACKUP_PREFIX }),
    alertRecipients(c.env),
  ]);
  const summary: HealthSummary = {
    errorsLastHour: counts?.hour ?? 0,
    errorsLastDay: counts?.day ?? 0,
    alertThreshold: ALERT_THRESHOLD,
    alertsTo,
    emailMode: c.env.EMAIL_MODE === "resend" && c.env.RESEND_API_KEY ? "resend" : "log",
    errors: errors.results,
    audit: audit.results,
    backups: backups.objects
      .map((o): BackupRow => ({ name: o.key.slice(BACKUP_PREFIX.length), bytes: o.size, createdAt: Math.floor(o.uploaded.getTime() / 1000) }))
      .sort((a, b) => b.name.localeCompare(a.name)),
  };
  return c.json(summary);
});

// Clear the error list, e.g. after fixing what caused them.
health.delete("/errors", async (c) => {
  await c.env.DB.prepare("DELETE FROM error_log").run();
  return c.json({ ok: true });
});

// Make a backup now (the nightly one runs at 3am UK time).
health.post("/backups", async (c) => {
  const result = await runBackup(c.env.DB, c.env.PHOTOS);
  return c.json(result);
});

// Download one backup, to keep a copy somewhere else or to restore from.
health.get("/backups/:name", async (c) => {
  const name = c.req.param("name");
  if (!isBackupName(name)) return c.json({ error: "Backup not found." }, 404);
  const object = await c.env.PHOTOS.get(BACKUP_PREFIX + name);
  if (!object) return c.json({ error: "Backup not found." }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="snackchat-${name}"`,
      "Cache-Control": "no-store",
    },
  });
});
