import { Hono } from "hono";
import type { AppContext } from "../env";
import { currentUser } from "../lib/currentUser";
import { visibleMember, welcomeLikeCount } from "../lib/joins";

// Likes on the "X joined Crunchd" lines in the feed (lib/joins.ts).
export const joins = new Hono<AppContext>();

const now = () => Math.floor(Date.now() / 1000);

// Like someone's join. Doing it twice is harmless (INSERT OR IGNORE). You
// can't like your own.
joins.put("/:username/like", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const memberId = await visibleMember(db, user.id, c.req.param("username"));
  if (!memberId) return c.json({ error: "No one by that name." }, 404);
  if (memberId === user.id) return c.json({ error: "You can't like your own join." }, 400);
  await db
    .prepare("INSERT OR IGNORE INTO welcome_likes (member_id, user_id, created_at) VALUES (?, ?, ?)")
    .bind(memberId, user.id, now())
    .run();
  return c.json({ liked: true, likes: await welcomeLikeCount(db, user.id, memberId) });
});

// Take your like back.
joins.delete("/:username/like", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const memberId = await visibleMember(db, user.id, c.req.param("username"));
  if (!memberId) return c.json({ error: "No one by that name." }, 404);
  await db.prepare("DELETE FROM welcome_likes WHERE member_id = ? AND user_id = ?").bind(memberId, user.id).run();
  return c.json({ liked: false, likes: await welcomeLikeCount(db, user.id, memberId) });
});
