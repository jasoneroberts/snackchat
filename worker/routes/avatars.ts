import { Hono } from "hono";
import type { AppContext } from "../env";
import { newId } from "../lib/crypto";
import { currentUser } from "../lib/currentUser";

export const avatars = new Hono<AppContext>();

// The browser crops and shrinks the picture first (src/lib/image.ts), so it
// arrives as a small JPEG. The limit just stops anything silly.
const MAX_AVATAR_BYTES = 1024 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const avatarKey = (userId: string, avatarId: string) => `avatars/${userId}/${avatarId}`;

// Serve a profile picture to anyone signed in. Unlike check-in photos these
// show for private people too, because they still appear on group boards.
// Each upload gets a new id, so the browser can cache one for a year.
avatars.get("/:id", async (c) => {
  currentUser(c);
  const row = await c.env.DB.prepare("SELECT id FROM users WHERE avatar_id = ?")
    .bind(c.req.param("id"))
    .first<{ id: string }>();
  if (!row) return c.json({ error: "Picture not found." }, 404);

  const object = await c.env.PHOTOS.get(avatarKey(row.id, c.req.param("id")));
  if (!object) return c.json({ error: "Picture not found." }, 404);

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg",
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: object.httpEtag,
    },
  });
});

// Set or replace your picture. It arrives as a form with one "photo" file.
avatars.post("/", async (c) => {
  const user = currentUser(c);
  const form = await c.req.parseBody().catch(() => null);
  const photo = form?.photo instanceof File && form.photo.size > 0 ? form.photo : null;
  if (!photo) return c.json({ error: "Pick a photo." }, 400);
  if (!AVATAR_TYPES.has(photo.type)) return c.json({ error: "Photos must be JPEG, PNG or WebP." }, 400);
  if (photo.size > MAX_AVATAR_BYTES) return c.json({ error: "That photo is too big (1 MB max)." }, 400);

  const avatarId = newId();
  await c.env.PHOTOS.put(avatarKey(user.id, avatarId), photo.stream(), {
    httpMetadata: { contentType: photo.type },
  });
  await c.env.DB.prepare("UPDATE users SET avatar_id = ? WHERE id = ?").bind(avatarId, user.id).run();
  if (user.avatar_id) await c.env.PHOTOS.delete(avatarKey(user.id, user.avatar_id));
  return c.json({ avatarId }, 201);
});

// Remove your picture and go back to initials.
avatars.delete("/", async (c) => {
  const user = currentUser(c);
  if (!user.avatar_id) return c.json({ ok: true });
  await c.env.DB.prepare("UPDATE users SET avatar_id = NULL WHERE id = ?").bind(user.id).run();
  await c.env.PHOTOS.delete(avatarKey(user.id, user.avatar_id));
  return c.json({ ok: true });
});
