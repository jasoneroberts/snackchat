import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ReviewQueue } from "../../shared/types";
import type { AppContext } from "../env";
import { currentUser } from "../lib/currentUser";
import { avatarKey } from "./avatars";

// Photo approval. Every new check-in photo and profile picture waits here
// until an admin approves or rejects it. (An AI check could later approve the
// obvious ones before they reach this queue.)
export const admin = new Hono<AppContext>();

admin.use("*", async (c, next) => {
  if (currentUser(c).is_admin !== 1) throw new HTTPException(403, { message: "Admins only." });
  await next();
});

/** How many things are waiting, for the badge in Settings. */
export async function reviewCount(db: D1Database): Promise<number> {
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM photos WHERE status = 'pending')
            + (SELECT COUNT(*) FROM users WHERE avatar_pending_id IS NOT NULL) AS n`,
    )
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// Everything waiting, oldest first.
admin.get("/queue", async (c) => {
  const db = c.env.DB;
  const [photos, avatars] = await Promise.all([
    db
      .prepare(
        `SELECT p.id, u.username, s.name AS snackName, c.review, p.created_at AS createdAt
           FROM photos p
           JOIN checkins c ON c.id = p.checkin_id
           JOIN users u ON u.id = c.user_id
           JOIN snacks s ON s.id = c.snack_id
          WHERE p.status = 'pending'
          ORDER BY p.created_at
          LIMIT 50`,
      )
      .all<ReviewQueue["photos"][number]>(),
    db
      .prepare(
        `SELECT id AS userId, username, avatar_pending_id AS avatarId, avatar_id AS currentId
           FROM users WHERE avatar_pending_id IS NOT NULL
          ORDER BY username
          LIMIT 50`,
      )
      .all<ReviewQueue["avatars"][number]>(),
  ]);
  return c.json({ photos: photos.results, avatars: avatars.results } satisfies ReviewQueue);
});

const readAction = async (req: Request) => {
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  return body?.action === "approve" || body?.action === "reject" ? body.action : null;
};

// Approve shows the photo to everyone. Reject removes it from storage and
// takes back the photo points; the check-in itself stays.
admin.post("/photos/:id", async (c) => {
  const action = await readAction(c.req.raw);
  if (!action) return c.json({ error: "Approve or reject?" }, 400);
  const db = c.env.DB;
  const photo = await db
    .prepare("SELECT checkin_id, r2_key FROM photos WHERE id = ? AND status = 'pending'")
    .bind(c.req.param("id"))
    .first<{ checkin_id: string; r2_key: string }>();
  if (!photo) return c.json({ error: "Already dealt with." }, 404);

  if (action === "approve") {
    await db.prepare("UPDATE photos SET status = 'visible' WHERE id = ?").bind(c.req.param("id")).run();
  } else {
    await db.batch([
      db.prepare("UPDATE photos SET status = 'hidden' WHERE id = ?").bind(c.req.param("id")),
      db.prepare("DELETE FROM points_ledger WHERE checkin_id = ? AND reason = 'photo'").bind(photo.checkin_id),
    ]);
    await c.env.PHOTOS.delete(photo.r2_key);
  }
  return c.json({ ok: true });
});

// Approve swaps the waiting picture in for the old one; reject throws it away.
admin.post("/avatars/:userId", async (c) => {
  const action = await readAction(c.req.raw);
  if (!action) return c.json({ error: "Approve or reject?" }, 400);
  const db = c.env.DB;
  const userId = c.req.param("userId");
  const user = await db
    .prepare("SELECT avatar_id, avatar_pending_id FROM users WHERE id = ? AND avatar_pending_id IS NOT NULL")
    .bind(userId)
    .first<{ avatar_id: string | null; avatar_pending_id: string }>();
  if (!user) return c.json({ error: "Already dealt with." }, 404);

  if (action === "approve") {
    await db
      .prepare("UPDATE users SET avatar_id = avatar_pending_id, avatar_pending_id = NULL WHERE id = ?")
      .bind(userId)
      .run();
    if (user.avatar_id) await c.env.PHOTOS.delete(avatarKey(userId, user.avatar_id));
  } else {
    await db.prepare("UPDATE users SET avatar_pending_id = NULL WHERE id = ?").bind(userId).run();
    await c.env.PHOTOS.delete(avatarKey(userId, user.avatar_pending_id));
  }
  return c.json({ ok: true });
});
