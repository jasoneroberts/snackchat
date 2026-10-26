import { Hono } from "hono";
import { readReport, reasonLabel } from "../../shared/reports";
import type { AppContext } from "../env";
import { newId } from "../lib/crypto";
import { currentUser } from "../lib/currentUser";
import { pingAdmins } from "../lib/notify";

const now = () => Math.floor(Date.now() / 1000);

// Reporting. Anyone signed in can report a check-in (its review or photo), a
// person or a snack. Admins deal with reports in Settings > Reports.
export const reports = new Hono<AppContext>();

// Enough for real problems; stops one person flooding the queue.
const MAX_REPORTS_PER_DAY = 20;

const TARGET_SQL = {
  checkin: "SELECT user_id AS owner FROM checkins WHERE id = ?",
  user: "SELECT id AS owner FROM users WHERE id = ?",
  snack: "SELECT created_by AS owner FROM snacks WHERE id = ?",
} as const;

// { targetType, targetId, reason, note? }
reports.post("/", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const parsed = readReport(await c.req.json().catch(() => null));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { targetType, targetId, reason, note } = parsed.value;

  const target = await db.prepare(TARGET_SQL[targetType]).bind(targetId).first<{ owner: string | null }>();
  if (!target) return c.json({ error: "That's already gone." }, 404);
  if (targetType !== "snack" && target.owner === user.id) return c.json({ error: "That's yours. You can delete it instead." }, 400);

  // Already reported it and not dealt with yet? Nothing more to do.
  const [already, today] = await Promise.all([
    db
      .prepare("SELECT 1 FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND resolved = 0")
      .bind(user.id, targetType, targetId)
      .first(),
    db
      .prepare("SELECT COUNT(*) AS n FROM reports WHERE reporter_id = ? AND created_at > ?")
      .bind(user.id, now() - 86400)
      .first<{ n: number }>(),
  ]);
  if (already) return c.json({ ok: true });
  if ((today?.n ?? 0) >= MAX_REPORTS_PER_DAY) return c.json({ error: "That's a lot of reports today. Try again tomorrow." }, 429);

  await db
    .prepare(
      `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(newId(), user.id, targetType, targetId, reason, note, now())
    .run();
  const what = targetType === "checkin" ? "a check-in" : targetType === "user" ? "a person" : "a snack";
  pingAdmins(c, { kind: "report", title: "New report", body: `@${user.username} reported ${what}: ${reasonLabel(reason)}.`, url: "/admin/reports" }, user.id);
  return c.json({ ok: true }, 201);
});

// Blocking. Blocking someone hides their check-ins from you and yours from
// them, everywhere check-ins are listed. They aren't told.
export const blocks = new Hono<AppContext>();

// Everyone you've blocked, for Settings.
blocks.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.username, u.avatar_id AS avatarId, b.created_at AS blockedAt
       FROM blocks b JOIN users u ON u.id = b.blocked_id
      WHERE b.blocker_id = ?
      ORDER BY u.username COLLATE NOCASE`,
  )
    .bind(currentUser(c).id)
    .all<{ username: string; avatarId: string | null; blockedAt: number }>();
  return c.json({ blocked: results });
});

const findUser = (db: D1Database, username: string) =>
  db.prepare("SELECT id FROM users WHERE username = ?").bind(username).first<{ id: string }>();

blocks.put("/:username", async (c) => {
  const user = currentUser(c);
  const other = await findUser(c.env.DB, c.req.param("username"));
  if (!other) return c.json({ error: "No one by that name." }, 404);
  if (other.id === user.id) return c.json({ error: "You can't block yourself." }, 400);
  await c.env.DB.prepare("INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)")
    .bind(user.id, other.id, now())
    .run();
  return c.json({ ok: true });
});

blocks.delete("/:username", async (c) => {
  const other = await findUser(c.env.DB, c.req.param("username"));
  if (other) {
    await c.env.DB.prepare("DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?").bind(currentUser(c).id, other.id).run();
  }
  return c.json({ ok: true });
});
