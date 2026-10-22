import { Hono } from "hono";
import { UNIVERSAL } from "../../shared/catalogue";
import type { AppContext } from "../env";
import { currentUser } from "../lib/currentUser";
import { listCheckins } from "../lib/feed";

export const users = new Hono<AppContext>();

// A profile: headline numbers, taste profile and recent check-ins.
users.get("/:username", async (c) => {
  const viewer = currentUser(c);
  const db = c.env.DB;

  const user = await db
    .prepare("SELECT id, username, country, is_private, created_at FROM users WHERE username = ?")
    .bind(c.req.param("username"))
    .first<{ id: string; username: string; country: string; is_private: number; created_at: number }>();
  if (!user) return c.json({ error: "No one by that name." }, 404);

  const profile = { username: user.username, country: user.country, joinedAt: user.created_at };
  if (user.is_private && user.id !== viewer.id) return c.json({ profile, private: true });

  const [stats, points, taste, checkins] = await Promise.all([
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
    // Average of each universal slider across everything they've rated.
    db
      .prepare(
        `SELECT a.attribute, AVG(a.value) AS avg
           FROM checkin_attributes a JOIN checkins c ON c.id = a.checkin_id
          WHERE c.user_id = ? AND a.attribute IN (${UNIVERSAL.map(() => "?").join(", ")})
          GROUP BY a.attribute`,
      )
      .bind(user.id, ...UNIVERSAL.map((a) => a.key))
      .all<{ attribute: string; avg: number }>(),
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
    taste: Object.fromEntries(taste.results.map((t) => [t.attribute, t.avg])),
    checkins,
  });
});
