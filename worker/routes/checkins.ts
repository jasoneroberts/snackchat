import { Hono } from "hono";
import type { CheckinForEdit, Liker } from "../../shared/types";
import type { AppContext } from "../env";
import { newId } from "../lib/crypto";
import { blockedEitherWay } from "../lib/blocks";
import { pointsFor, startOfUtcDay, validateCheckin } from "../lib/checkin";
import { currentUser } from "../lib/currentUser";
import { listCheckins, nextCursor, parseCursor } from "../lib/feed";
import { joinWindow, listJoins } from "../lib/joins";
import { overDailyLimit } from "../lib/limits";
import { inBackground, pingAdmins } from "../lib/notify";
import { notifyLike } from "../lib/likeAlerts";
import { notifySquads } from "../lib/squadAlerts";
import { firstCheckinBonus, tellInviterAboutCheckin } from "../lib/referrals";
import { newBadgesSafely } from "../lib/achievements";

export const checkins = new Hono<AppContext>();

/** Admins' own photos go straight up; everyone else's wait in the review queue. */
const photoStatusFor = (user: { is_admin: number }) => (user.is_admin === 1 ? "visible" : "pending");

const now = () => Math.floor(Date.now() / 1000);

// The browser shrinks photos before upload (src/lib/image.ts), so 5 MB is plenty.
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// The feed: everyone's recent check-ins, newest first, 20 at a time.
checkins.get("/", async (c) => {
  const user = currentUser(c);
  const limit = 20;
  const before = parseCursor(c.req.query("before"));
  const items = await listCheckins(c.env.DB, { viewerId: user.id, before, limit });
  const next = nextCursor(items, limit);
  // "X joined Crunchd" lines from the same stretch of time as these check-ins,
  // for the app to slot in between them (lib/joins.ts).
  const joins = await listJoins(c.env.DB, user.id, joinWindow(before, items, next !== null));
  return c.json({ items, joins, next });
});

// Post a check-in. It arrives as a form with two parts: "data" (the check-in as
// JSON) and an optional "photo" file.
checkins.post("/", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const tooMany = await overDailyLimit(c, "checkins");
  if (tooMany) return c.json({ error: tooMany }, 429);

  const form = await c.req.parseBody().catch(() => null);
  if (!form || typeof form.data !== "string") return c.json({ error: "Missing check-in." }, 400);
  let raw: unknown;
  try {
    raw = JSON.parse(form.data);
  } catch {
    return c.json({ error: "Missing check-in." }, 400);
  }

  const snackId = (raw as { snackId?: unknown })?.snackId;
  const snack =
    typeof snackId === "string"
      ? await db
          .prepare("SELECT id, name, category_id, status, created_by FROM snacks WHERE id = ?")
          .bind(snackId)
          .first<{ id: string; name: string; category_id: string; status: string; created_by: string | null }>()
      : null;
  const usable = snack && (snack.status === "approved" || (snack.status === "pending" && snack.created_by === user.id));
  if (!snack || !usable) return c.json({ error: "Pick a snack." }, 400);

  const parsed = validateCheckin(raw, snack.category_id);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const input = parsed.value;

  const photo = form.photo instanceof File && form.photo.size > 0 ? form.photo : null;
  if (photo && !PHOTO_TYPES.has(photo.type)) return c.json({ error: "Photos must be JPEG, PNG or WebP." }, 400);
  if (photo && photo.size > MAX_PHOTO_BYTES) return c.json({ error: "That photo is too big (5 MB max)." }, 400);

  const time = now();
  const [seen, today] = await Promise.all([
    db.prepare("SELECT 1 FROM checkins WHERE user_id = ? AND snack_id = ? LIMIT 1").bind(user.id, snack.id).first(),
    db
      // Only check-in points count toward the daily cap, not invite bonuses.
      .prepare(
        "SELECT COALESCE(SUM(points), 0) AS total FROM points_ledger WHERE user_id = ? AND created_at >= ? AND checkin_id IS NOT NULL",
      )
      .bind(user.id, startOfUtcDay(time))
      .first<{ total: number }>(),
  ]);
  const lines = pointsFor({
    firstTime: !seen,
    hasPhoto: photo !== null,
    review: input.review,
    earnedToday: today?.total ?? 0,
  });

  const checkinId = newId();
  const photoId = photo ? newId() : null;
  const photoKey = photo ? `checkins/${checkinId}/${photoId}` : null;

  // Store the photo first: if that fails nothing has been written yet.
  if (photo && photoKey) {
    await c.env.PHOTOS.put(photoKey, photo.stream(), { httpMetadata: { contentType: photo.type } });
  }

  // Everything else goes in one batch, which D1 runs as a single transaction.
  const statements = [
    db
      .prepare(
        `INSERT INTO checkins (id, user_id, snack_id, overall, review, venue_text, paired_with, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(checkinId, user.id, snack.id, input.overall, input.review, input.venue, input.pairedWith, time),
    ...Object.entries(input.attributes).map(([attribute, value]) =>
      db
        .prepare("INSERT INTO checkin_attributes (checkin_id, attribute, value) VALUES (?, ?, ?)")
        .bind(checkinId, attribute, value),
    ),
    ...lines.map((line) =>
      db
        .prepare("INSERT INTO points_ledger (user_id, checkin_id, reason, points, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(user.id, checkinId, line.reason, line.points, time),
    ),
    // If they joined from a friend's invite and this is their first check-in, the friend gets a bonus.
    ...firstCheckinBonus(db, { friendId: user.id, checkinId, time }),
  ];
  // Photos wait for an admin to approve them (routes/admin.ts), except an
  // admin's own; the check-in and its points go live straight away.
  const photoStatus = photoStatusFor(user);
  if (photoId && photoKey) {
    statements.push(
      db
        .prepare("INSERT INTO photos (id, checkin_id, r2_key, status, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(photoId, checkinId, photoKey, photoStatus, time),
    );
  }

  try {
    await db.batch(statements);
  } catch (err) {
    if (photoKey) await c.env.PHOTOS.delete(photoKey);
    throw err;
  }

  inBackground(c, tellInviterAboutCheckin(c.env, new URL(c.req.url).origin, { checkinId, friendName: user.username }));
  // Squad mates hear about it too (lib/squadAlerts.ts), once per snacking session.
  inBackground(
    c,
    notifySquads(c.env, new URL(c.req.url).origin, {
      checkinId,
      posterId: user.id,
      posterName: user.username,
      snack: snack.name,
      overall: input.overall,
      time,
    }),
  );
  if (photoId && photoStatus === "pending") {
    pingAdmins(c, { kind: "photo", title: "Photo to approve", body: `${user.username} added a photo of ${snack.name}.`, url: "/review" }, user.id);
  }
  // Any badges this check-in has just earned, for the "New badge!" on the share screen.
  const newBadges = await newBadgesSafely(db, user.id, time);
  return c.json(
    {
      id: checkinId,
      points: lines.reduce((sum, l) => sum + l.points, 0),
      lines,
      photoPending: photoId !== null && photoStatus === "pending",
      newBadges,
    },
    201,
  );
});

// One of your own check-ins, to edit it: the details, its sliders and its
// photo (pending or approved).
checkins.get("/:id", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const row = await db
    .prepare(
      `SELECT c.id, c.overall, c.review, c.venue_text AS venue, c.paired_with AS pairedWith,
              s.id AS snackId, s.name, s.brand, s.category_id AS category, s.status
         FROM checkins c JOIN snacks s ON s.id = c.snack_id
        WHERE c.id = ? AND c.user_id = ?`,
    )
    .bind(c.req.param("id"), user.id)
    .first<{ id: string; overall: number; review: string | null; venue: string | null; pairedWith: string | null; snackId: string; name: string; brand: string | null; category: string; status: string }>();
  if (!row) return c.json({ error: "Check-in not found." }, 404);
  const [attrs, photo] = await Promise.all([
    db.prepare("SELECT attribute, value FROM checkin_attributes WHERE checkin_id = ?").bind(row.id).all<{ attribute: string; value: number }>(),
    db
      .prepare("SELECT id, status FROM photos WHERE checkin_id = ? AND status IN ('visible', 'pending') ORDER BY created_at DESC LIMIT 1")
      .bind(row.id)
      .first<{ id: string; status: "visible" | "pending" }>(),
  ]);
  const checkin: CheckinForEdit = {
    id: row.id,
    snack: { id: row.snackId, name: row.name, brand: row.brand, category: row.category, status: row.status },
    overall: row.overall,
    attributes: Object.fromEntries(attrs.results.map((a) => [a.attribute, a.value])),
    review: row.review,
    venue: row.venue,
    pairedWith: row.pairedWith,
    photo: photo ?? null,
  };
  return c.json({ checkin });
});

// Change one of your check-ins. A form like posting one: "data" (JSON with
// overall, attributes, review, venue, pairedWith, and removePhoto: true to drop
// the photo) and an optional new "photo". The snack itself can't change.
// A new photo replaces the old one and waits for approval again. Points stay
// as they were when you checked in.
checkins.patch("/:id", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");

  const existing = await db
    .prepare("SELECT c.snack_id, s.category_id FROM checkins c JOIN snacks s ON s.id = c.snack_id WHERE c.id = ? AND c.user_id = ?")
    .bind(id, user.id)
    .first<{ snack_id: string; category_id: string }>();
  if (!existing) return c.json({ error: "Check-in not found." }, 404);

  const form = await c.req.parseBody().catch(() => null);
  if (!form || typeof form.data !== "string") return c.json({ error: "Missing check-in." }, 400);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(form.data);
  } catch {
    return c.json({ error: "Missing check-in." }, 400);
  }
  const parsed = validateCheckin({ ...raw, snackId: existing.snack_id }, existing.category_id);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const input = parsed.value;

  const photo = form.photo instanceof File && form.photo.size > 0 ? form.photo : null;
  if (photo && !PHOTO_TYPES.has(photo.type)) return c.json({ error: "Photos must be JPEG, PNG or WebP." }, 400);
  if (photo && photo.size > MAX_PHOTO_BYTES) return c.json({ error: "That photo is too big (5 MB max)." }, 400);
  const dropPhotos = photo !== null || raw.removePhoto === true;

  const photoId = photo ? newId() : null;
  const photoKey = photo ? `checkins/${id}/${photoId}` : null;
  if (photo && photoKey) await c.env.PHOTOS.put(photoKey, photo.stream(), { httpMetadata: { contentType: photo.type } });

  const old = dropPhotos
    ? (await db.prepare("SELECT id, r2_key FROM photos WHERE checkin_id = ?").bind(id).all<{ id: string; r2_key: string }>()).results
    : [];

  const statements = [
    db
      .prepare("UPDATE checkins SET overall = ?, review = ?, venue_text = ?, paired_with = ? WHERE id = ?")
      .bind(input.overall, input.review, input.venue, input.pairedWith, id),
    db.prepare("DELETE FROM checkin_attributes WHERE checkin_id = ?").bind(id),
    ...Object.entries(input.attributes).map(([attribute, value]) =>
      db.prepare("INSERT INTO checkin_attributes (checkin_id, attribute, value) VALUES (?, ?, ?)").bind(id, attribute, value),
    ),
  ];
  if (old.length) {
    statements.push(
      // A snack whose main picture was this photo goes back to its newest one.
      db
        .prepare(`UPDATE snacks SET cover_photo_id = NULL WHERE cover_photo_id IN (SELECT id FROM photos WHERE checkin_id = ?)`)
        .bind(id),
      db.prepare("DELETE FROM photos WHERE checkin_id = ?").bind(id),
    );
  }
  if (photoId && photoKey) {
    statements.push(
      db
        .prepare("INSERT INTO photos (id, checkin_id, r2_key, status, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(photoId, id, photoKey, photoStatusFor(user), now()),
    );
  }

  try {
    await db.batch(statements);
  } catch (err) {
    if (photoKey) await c.env.PHOTOS.delete(photoKey);
    throw err;
  }
  // Old files go once the database no longer points at them.
  if (old.length) await c.env.PHOTOS.delete(old.map((p) => p.r2_key));
  const pending = photoId !== null && photoStatusFor(user) === "pending";
  if (pending) {
    pingAdmins(c, { kind: "photo", title: "Photo to approve", body: `${user.username} changed the photo on a check-in.`, url: "/review" }, user.id);
  }
  return c.json({ ok: true, photoPending: pending });
});

// Delete your own check-in. Its sliders, photo rows and points go with it
// (ON DELETE CASCADE); the photo files are removed from R2 here.
checkins.delete("/:id", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;

  const owned = await db.prepare("SELECT 1 FROM checkins WHERE id = ? AND user_id = ?").bind(id, user.id).first();
  if (!owned) return c.json({ error: "Check-in not found." }, 404);

  const { results: photos } = await db
    .prepare("SELECT r2_key FROM photos WHERE checkin_id = ?")
    .bind(id)
    .all<{ r2_key: string }>();
  await db.prepare("DELETE FROM checkins WHERE id = ?").bind(id).run();
  if (photos.length) await c.env.PHOTOS.delete(photos.map((p) => p.r2_key));
  return c.json({ ok: true });
});

// Hearts. You can heart any check-in you can see in the feed: not from a
// private profile (unless it's yours) and not from someone blocked either way.
async function canSee(db: D1Database, viewerId: string, checkinId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM checkins c JOIN users u ON u.id = c.user_id
        WHERE c.id = ?2 AND (u.is_private = 0 OR u.id = ?1) AND NOT ${blockedEitherWay("?1", "c.user_id")}`,
    )
    .bind(viewerId, checkinId)
    .first();
  return row !== null;
}

/** The heart count after a change, counted the same way as the feed. */
const likeCount = (db: D1Database, viewerId: string, checkinId: string) =>
  db
    .prepare(`SELECT COUNT(*) AS n FROM likes l WHERE l.checkin_id = ?2 AND NOT ${blockedEitherWay("?1", "l.user_id")}`)
    .bind(viewerId, checkinId)
    .first<number>("n");

// Heart a check-in. Doing it twice is harmless (INSERT OR IGNORE). A new
// heart also pushes a message to the check-in's owner (lib/likeAlerts.ts),
// after the response has gone so the heart turns red straight away.
checkins.put("/:id/like", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  if (!(await canSee(db, user.id, id))) return c.json({ error: "Check-in not found." }, 404);
  const added = await db.prepare("INSERT OR IGNORE INTO likes (checkin_id, user_id, created_at) VALUES (?, ?, ?)").bind(id, user.id, now()).run();
  if (added.meta.changes) inBackground(c, notifyLike(c.env, new URL(c.req.url).origin, id, user.id));
  return c.json({ liked: true, likes: await likeCount(db, user.id, id) });
});

// Take your heart back.
checkins.delete("/:id/like", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  await db.prepare("DELETE FROM likes WHERE checkin_id = ? AND user_id = ?").bind(id, user.id).run();
  return c.json({ liked: false, likes: await likeCount(db, user.id, id) });
});

// Who hearted a check-in, newest first. People you can't see are left out.
checkins.get("/:id/likes", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  if (!(await canSee(db, user.id, id))) return c.json({ error: "Check-in not found." }, 404);
  const { results } = await db
    .prepare(
      `SELECT u.username, u.avatar_id, l.created_at FROM likes l JOIN users u ON u.id = l.user_id
        WHERE l.checkin_id = ?2 AND NOT ${blockedEitherWay("?1", "l.user_id")}
        ORDER BY l.created_at DESC LIMIT 200`,
    )
    .bind(user.id, id)
    .all<{ username: string; avatar_id: string | null; created_at: number }>();
  const people: Liker[] = results.map((r) => ({ username: r.username, avatarId: r.avatar_id, likedAt: r.created_at }));
  return c.json({ people });
});
