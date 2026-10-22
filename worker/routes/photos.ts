import { Hono } from "hono";
import type { AppContext } from "../env";
import { currentUser } from "../lib/currentUser";

export const photos = new Hono<AppContext>();

// Serve a check-in photo from R2. Photos never change once uploaded, so the
// browser may keep them for a year. A private person's photos are only served
// to them.
photos.get("/:id", async (c) => {
  const viewer = currentUser(c);
  const row = await c.env.DB.prepare(
    `SELECT p.r2_key FROM photos p
       JOIN checkins ch ON ch.id = p.checkin_id
       JOIN users u ON u.id = ch.user_id
      WHERE p.id = ? AND p.status = 'visible' AND (u.is_private = 0 OR u.id = ?)`,
  )
    .bind(c.req.param("id"), viewer.id)
    .first<{ r2_key: string }>();
  if (!row) return c.json({ error: "Photo not found." }, 404);

  const object = await c.env.PHOTOS.get(row.r2_key);
  if (!object) return c.json({ error: "Photo not found." }, 404);

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg",
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: object.httpEtag,
    },
  });
});
