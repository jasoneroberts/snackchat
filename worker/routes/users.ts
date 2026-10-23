import { Hono } from "hono";
import type { AppContext } from "../env";
import { currentUser } from "../lib/currentUser";
import { listCheckins } from "../lib/feed";
import { getPreferences } from "./explore";

export const users = new Hono<AppContext>();

// A profile: headline numbers, taste preferences and recent check-ins.
users.get("/:username", async (c) => {
  const viewer = currentUser(c);
  const db = c.env.DB;

  const user = await db
    .prepare("SELECT id, username, avatar_id, country, is_private, created_at FROM users WHERE username = ?")
    .bind(c.req.param("username"))
    .first<{ id: string; username: string; avatar_id: string | null; country: string; is_private: number; created_at: number }>();
  if (!user) return c.json({ error: "No one by that name." }, 404);

  const profile = { username: user.username, avatarId: user.avatar_id, country: user.country, joinedAt: user.created_at };
  if (user.is_private && user.id !== viewer.id) return c.json({ profile, private: true });

  const [stats, points, preferences, checkins] = await Promise.all([
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
    getPreferences(db, user.id),
    listCheckins(db, { viewerId: viewer.id, userId: user.id, limit: 20 }),
  ]);

  return c.json({
    profile,
    private: false,
    stats: {
      checkins: stats?.checkins ?? 0,
      snacks: stats?.snacks ?? 0,
      avg: stats?.avg ?? null,
      points: points?.total ?? 0,
    },
    preferences,
    checkins,
  });
});
