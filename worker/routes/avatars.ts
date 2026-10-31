import { Hono } from "hono";
import type { AppContext } from "../env";
import { newId } from "../lib/crypto";
import { currentUser } from "../lib/currentUser";
import { pingAdmins } from "../lib/notify";

export const avatars = new Hono<AppContext>();

// The browser crops and shrinks the picture first (src/lib/image.ts), so it
// arrives as a small JPEG. The limit just stops anything silly.
const MAX_AVATAR_BYTES = 1024 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const avatarKey = (userId: string, avatarId: string) => `avatars/${userId}/${avatarId}`;

// Serve a profile picture to anyone signed in. Unlike check-in photos these
// show for private people too, because they still appear on group boards.
// One waiting for approval is only served to its owner and to admins.
// Each upload gets a new id, so the browser can cache one for a year.
avatars.get("/:id", async (c) => {
  const viewer = currentUser(c);
  const row = await c.env.DB.prepare(
    "SELECT id FROM users WHERE avatar_id = ?1 OR (avatar_pending_id = ?1 AND (id = ?2 OR ?3 = 1))",
  )
    .bind(c.req.param("id"), viewer.id, viewer.is_admin)
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

// Upload a new picture. It arrives as a form with one "photo" file and waits
// for an admin (routes/admin.ts); everyone else keeps seeing the old one.
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
  // Replacing a picture that was still waiting? Its file isn't needed any more.
  if (user.avatar_pending_id) await c.env.PHOTOS.delete(avatarKey(user.id, user.avatar_pending_id));
  // An admin's own picture needs no approval: it replaces the old one now.
  if (user.is_admin === 1) {
    await c.env.DB.prepare("UPDATE users SET avatar_id = ?, avatar_pending_id = NULL WHERE id = ?").bind(avatarId, user.id).run();
    if (user.avatar_id) await c.env.PHOTOS.delete(avatarKey(user.id, user.avatar_id));
    return c.json({ avatarId, avatarPendingId: null }, 201);
  }
  await c.env.DB.prepare("UPDATE users SET avatar_pending_id = ? WHERE id = ?").bind(avatarId, user.id).run();
  pingAdmins(c, { kind: "photo", title: "Profile picture to approve", body: `${user.username} wants a new profile picture.`, url: "/review" }, user.id);
  return c.json({ avatarPendingId: avatarId }, 201);
});

// Remove your picture (and any waiting one) and go back to initials.
avatars.delete("/", async (c) => {
  const user = currentUser(c);
  const ids = [user.avatar_id, user.avatar_pending_id].filter((id): id is string => id !== null);
  if (!ids.length) return c.json({ ok: true });
  await c.env.DB.prepare("UPDATE users SET avatar_id = NULL, avatar_pending_id = NULL WHERE id = ?").bind(user.id).run();
  await c.env.PHOTOS.delete(ids.map((id) => avatarKey(user.id, id)));
  return c.json({ ok: true });
});
