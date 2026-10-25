import { Hono } from "hono";
import type { AppContext } from "../env";
import { currentUser } from "../lib/currentUser";
import { listCheckins } from "../lib/feed";
import { blockedEitherWay } from "../lib/blocks";

export const users = new Hono<AppContext>();

// A profile: headline numbers and recent check-ins.
users.get("/:username", async (c) => {
  const viewer = currentUser(c);
  const db = c.env.DB;

  const user = await db
    .prepare("SELECT id, username, avatar_id, country, is_private, created_at FROM users WHERE username = ?")
    .bind(c.req.param("username"))
    .first<{ id: string; username: string; avatar_id: string | null; country: string; is_private: number; created_at: number }>();
  if (!user) return c.json({ error: "No one by that name." }, 404);

  const profile = { id: user.id, username: user.username, avatarId: user.avatar_id, country: user.country, joinedAt: user.created_at };
  // "you": you blocked them (you can unblock). "hidden": they blocked you, which isn't spelt out.
  const block = await db
    .prepare(
      `SELECT CASE WHEN EXISTS (SELECT 1 FROM blocks WHERE blocker_id = ?1 AND blocked_id = ?2) THEN 'you'
                   WHEN ${blockedEitherWay("?1", "?2")} THEN 'hidden' END AS state`,
    )
    .bind(viewer.id, user.id)
    .first<{ state: "you" | "hidden" | null }>();
  const blocked = block?.state ?? null;
  if (blocked) return c.json({ profile, private: blocked === "hidden", blocked });
  if (user.is_private && user.id !== viewer.id) return c.json({ profile, private: true, blocked });

  const [stats, points, checkins] = await Promise.all([
    db
      .prepare(
        "SELECT COUNT(*) AS checkins, COUNT(DISTINCT snack_id) AS snacks, AVG(overall) AS avg FROM checkins WHERE user_id = ?",
      )
      .bind(user.id)
      .first<{ checkins: number; snacks: number; avg: number | null }>(),
    db
      .prepare("SELECT COALESCE(SUM(points), 0) AS total FROM points_ledger WHERE user_id = ?")
      .bind(user.id)
      .first<{ total: number }>(),
    listCheckins(db, { viewerId: viewer.id, userId: user.id, limit: 20 }),
  ]);

  return c.json({
    profile,
    private: false,
    blocked,
    stats: {
      checkins: stats?.checkins ?? 0,
      snacks: stats?.snacks ?? 0,
      avg: stats?.avg ?? null,
      points: points?.total ?? 0,
    },
    checkins,
  });
});
