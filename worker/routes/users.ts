import { totalPointsSql } from "../lib/boards";
import { Hono } from "hono";
import type { TriedSnack } from "../../shared/types";
import type { AppContext } from "../env";
import { LATEST_PHOTO } from "../lib/photoSql";
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
      .prepare(`SELECT (${totalPointsSql("?")}) AS total`)
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

// Every snack someone has checked in, once each, with how they rated it.
// Same rules as the profile: nothing for private profiles (unless it's you) or blocks.
users.get("/:username/snacks", async (c) => {
  const viewer = currentUser(c);
  const db = c.env.DB;
  const user = await db
    .prepare(
      `SELECT u.id FROM users u WHERE u.username = ?2 AND (u.is_private = 0 OR u.id = ?1)
          AND NOT ${blockedEitherWay("?1", "u.id")}`,
    )
    .bind(viewer.id, c.req.param("username"))
    .first<{ id: string }>();
  if (!user) return c.json({ error: "No snacks to show." }, 404);

  const { results } = await db
    .prepare(
      `SELECT s.id, s.name, s.brand, s.category_id AS category, s.status, (${LATEST_PHOTO}) AS photoId,
              COUNT(*) AS times, MAX(c.overall) AS best, MAX(c.created_at) AS lastAt,
              (SELECT c2.overall FROM checkins c2 WHERE c2.user_id = ?1 AND c2.snack_id = s.id
                ORDER BY c2.created_at DESC LIMIT 1) AS latest
         FROM checkins c JOIN snacks s ON s.id = c.snack_id
        WHERE c.user_id = ?1
        GROUP BY s.id
        ORDER BY lastAt DESC`,
    )
    .bind(user.id)
    .all<{ id: string; name: string; brand: string | null; category: string; status: string; photoId: string | null; times: number; best: number; lastAt: number; latest: number }>();

  const snacks: TriedSnack[] = results.map((r) => ({
    snack: { id: r.id, name: r.name, brand: r.brand, category: r.category, status: r.status, photoId: r.photoId },
    times: r.times,
    latest: r.latest,
    best: r.best,
    lastAt: r.lastAt,
  }));
  return c.json({ snacks });
});
