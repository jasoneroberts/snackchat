import { Hono } from "hono";
import type { AppContext } from "../env";
import { currentUser } from "../lib/currentUser";
import { thumbCacheUrl, thumbnail, thumbWidth } from "../lib/thumbs";

export const photos = new Hono<AppContext>();

// Serve a check-in photo from R2. Photos never change once uploaded, so the
// browser may keep them for a year. A private person's photos are only served
// to them, and a photo waiting for approval only to them and to admins.
// Add ?w=320 or ?w=800 for a small copy (lib/thumbs.ts).
photos.get("/:id", async (c) => {
  const viewer = currentUser(c);
  const row = await c.env.DB.prepare(
    `SELECT p.r2_key FROM photos p
       JOIN checkins ch ON ch.id = p.checkin_id
       JOIN users u ON u.id = ch.user_id
      WHERE p.id = ?1
        AND ((p.status = 'visible' AND (u.is_private = 0 OR u.id = ?2))
          OR (p.status = 'pending' AND (u.id = ?2 OR ?3 = 1)))`,
  )
    .bind(c.req.param("id"), viewer.id, viewer.is_admin)
    .first<{ r2_key: string }>();
  if (!row) return c.json({ error: "Photo not found." }, 404);

  // ?w=320 or ?w=800: a small copy for tiles and thumbnails (lib/thumbs.ts).
  const width = thumbWidth(c.req.query("w"));
  if (width) {
    const small = await thumbnail(
      c.env.IMAGES,
      () => c.env.PHOTOS.get(row.r2_key),
      thumbCacheUrl(new URL(c.req.url).origin, c.req.param("id"), width),
      width,
      (p) => c.executionCtx.waitUntil(p),
    );
    if (small) return small;
  }

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
