import { Hono } from "hono";
import type { CheckinForEdit } from "../../shared/types";
import type { AppContext } from "../env";
import { newId } from "../lib/crypto";
import { pointsFor, startOfUtcDay, validateCheckin } from "../lib/checkin";
import { currentUser } from "../lib/currentUser";
import { listCheckins, nextCursor, parseCursor } from "../lib/feed";

export const checkins = new Hono<AppContext>();

const now = () => Math.floor(Date.now() / 1000);

// The browser shrinks photos before upload (src/lib/image.ts), so 5 MB is plenty.
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// The feed: everyone's recent check-ins, newest first, 20 at a time.
checkins.get("/", async (c) => {
  const user = currentUser(c);
  const limit = 20;
  const items = await listCheckins(c.env.DB, { viewerId: user.id, before: parseCursor(c.req.query("before")), limit });
  return c.json({ items, next: nextCursor(items, limit) });
});

// Post a check-in. It arrives as a form with two parts: "data" (the check-in as
// JSON) and an optional "photo" file.
checkins.post("/", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;

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
          .prepare("SELECT id, category_id, status, created_by FROM snacks WHERE id = ?")
          .bind(snackId)
          .first<{ id: string; category_id: string; status: string; created_by: string | null }>()
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
      .prepare("SELECT COALESCE(SUM(points), 0) AS total FROM points_ledger WHERE user_id = ? AND created_at >= ?")
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
  ];
  // Photos wait for an admin to approve them (routes/admin.ts); the check-in
  // and its points go live straight away.
  if (photoId && photoKey) {
    statements.push(
      db
        .prepare("INSERT INTO photos (id, checkin_id, r2_key, status, created_at) VALUES (?, ?, ?, 'pending', ?)")
        .bind(photoId, checkinId, photoKey, time),
    );
  }

  try {
    await db.batch(statements);
  } catch (err) {
    if (photoKey) await c.env.PHOTOS.delete(photoKey);
    throw err;
  }

  return c.json({ id: checkinId, points: lines.reduce((sum, l) => sum + l.points, 0), lines }, 201);
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
        .prepare("INSERT INTO photos (id, checkin_id, r2_key, status, created_at) VALUES (?, ?, ?, 'pending', ?)")
        .bind(photoId, id, photoKey, now()),
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
  return c.json({ ok: true, photoPending: photoId !== null });
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
