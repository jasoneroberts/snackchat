import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AdminSnackPhoto, AdminSnackRow, AdminUserRow, BrandRow, DemoStatus, DietRow, ReviewQueue } from "../../shared/types";
import type { AppContext } from "../env";
import { getCategory, POINTS } from "../../shared/catalogue";
import { currentUser } from "../lib/currentUser";
import { buildDemoData, DEMO_GROUPS, DEMO_PHOTO_PREFIX, DEMO_PREFIX, demoUserId, offSearchUrl, wantsPhoto } from "../lib/demo";
import { type DietSuggestion, offDietSearchUrl, type OffProduct, pickProduct, suggestDiet } from "../lib/diet";
import { newInviteCode } from "../lib/groups";
import { findLogoCandidates, isLogoHost, type LogoCandidate } from "../lib/logoCandidates";
import { brandKey } from "../../shared/brands";
import { hashPassword, newId } from "../lib/crypto";
import { LATEST_PHOTO } from "../lib/photoSql";
import { newPin } from "../lib/quickSignIn";
import { validateSnackFields } from "../lib/validation";
import { avatarKey } from "./avatars";
import { logoKey } from "./logos";

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

/** New snacks people have added that are waiting for a yes or no. */
export async function pendingSnackCount(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM snacks WHERE status = 'pending'").first<{ n: number }>();
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

// Demo data ---------------------------------------------------------------

/** Whether demo data is loaded, and which demo snacks still have no photo. */
admin.get("/demo", async (c) => {
  const db = c.env.DB;
  const [counts, missing] = await Promise.all([
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM users WHERE id LIKE 'demo-%') AS users,
                (SELECT COUNT(*) FROM checkins WHERE id LIKE 'demo-%') AS checkins,
                (SELECT COUNT(*) FROM photos WHERE id LIKE 'demo-%') AS photos`,
      )
      .first<{ users: number; checkins: number; photos: number }>(),
    db
      .prepare(
        `SELECT DISTINCT c.snack_id AS id FROM checkins c
          WHERE c.id LIKE 'demo-%'
            AND NOT EXISTS (SELECT 1 FROM photos p JOIN checkins pc ON pc.id = p.checkin_id
                             WHERE pc.snack_id = c.snack_id AND p.id LIKE 'demo-%')
          ORDER BY c.snack_id`,
      )
      .all<{ id: string }>(),
  ]);
  return c.json({
    users: counts?.users ?? 0,
    checkins: counts?.checkins ?? 0,
    photos: counts?.photos ?? 0,
    missingPhotos: missing.results.map((r) => r.id),
  } satisfies DemoStatus);
});

// Add the demo people, their check-ins and two groups (with you in both).
// Photos come afterwards, one snack per call (see below).
admin.post("/demo", async (c) => {
  const me = currentUser(c);
  const db = c.env.DB;
  const loaded = await db.prepare("SELECT 1 FROM users WHERE id LIKE 'demo-%' LIMIT 1").first();
  if (loaded) return c.json({ error: "Demo data is already loaded. Remove it first." }, 409);

  const time = Math.floor(Date.now() / 1000);
  const data = buildDemoData(time);
  const { results: taken } = await db
    .prepare(`SELECT username FROM users WHERE username IN (${data.users.map(() => "?").join(", ")})`)
    .bind(...data.users.map((u) => u.username))
    .all<{ username: string }>();
  if (taken.length) {
    return c.json({ error: `Someone already uses ${taken.map((t) => "@" + t.username).join(", ")}.` }, 409);
  }
  const statements: D1PreparedStatement[] = [];
  for (const u of data.users) {
    // "!" is not a valid password hash, so nobody can sign in as a demo person
    // (and quick sign-in can't claim them, because it only claims NULL).
    statements.push(
      db
        .prepare(
          `INSERT INTO users (id, username, email, password_hash, email_verified, created_at)
           VALUES (?, ?, ?, '!', 1, ?)`,
        )
        .bind(u.id, u.username, `${u.username}@demo.snackchat.invalid`, time - 30 * 24 * 3600),
    );
  }
  for (const ch of data.checkins) {
    statements.push(
      db
        .prepare("INSERT INTO checkins (id, user_id, snack_id, overall, review, venue_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(ch.id, ch.userId, ch.snackId, ch.overall, ch.review, ch.venue, ch.createdAt),
    );
    for (const [attribute, value] of Object.entries(ch.attributes)) {
      statements.push(
        db.prepare("INSERT INTO checkin_attributes (checkin_id, attribute, value) VALUES (?, ?, ?)").bind(ch.id, attribute, value),
      );
    }
    for (const line of ch.points) {
      statements.push(
        db
          .prepare("INSERT INTO points_ledger (user_id, checkin_id, reason, points, created_at) VALUES (?, ?, ?, ?, ?)")
          .bind(ch.userId, ch.id, line.reason, line.points, ch.createdAt),
      );
    }
  }
  for (const g of DEMO_GROUPS) {
    statements.push(
      db
        .prepare(
          `INSERT INTO groups (id, name, invite_code, scoring_mode, reset_period, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(g.id, g.name, newInviteCode(), g.scoring, g.reset, demoUserId(g.owner), time - 20 * 24 * 3600),
    );
    const members: [string, string][] = [
      [demoUserId(g.owner), "owner"],
      ...g.members.map((m): [string, string] => [demoUserId(m), "member"]),
      [me.id, "member"],
    ];
    for (const [userId, role] of members) {
      statements.push(
        db
          .prepare("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)")
          .bind(g.id, userId, role, time - 20 * 24 * 3600),
      );
    }
  }
  await db.batch(statements);
  return c.json({ users: data.users.length, checkins: data.checkins.length }, 201);
});

// Find one snack's pack photo on Open Food Facts and add it to some of that
// snack's demo check-ins. The page calls this once per snack, a few seconds
// apart, because Open Food Facts allows about 10 searches a minute.
admin.post("/demo/photos/:snackId", async (c) => {
  const db = c.env.DB;
  const snackId = c.req.param("snackId");
  const snack = await db
    .prepare("SELECT name, brand FROM snacks WHERE id = ?")
    .bind(snackId)
    .first<{ name: string; brand: string | null }>();
  if (!snack) return c.json({ error: "Snack not found." }, 404);

  const headers = { "User-Agent": "Snackchat/0.1 (demo data; github.com/jasoneroberts)" };
  // A snack with no photo is fine, so any failure here just reports "not found".
  let picture: { body: ArrayBuffer; type: string };
  try {
    const search = await fetch(offSearchUrl(snack.name, snack.brand), { headers });
    if (!search.ok) return c.json({ found: false, reason: `search ${search.status}` });
    const { products } = (await search.json()) as { products?: { image_front_url?: string }[] };
    const imageUrl = products?.find((p) => p.image_front_url)?.image_front_url;
    if (!imageUrl) return c.json({ found: false, reason: "no photo" });
    const image = await fetch(imageUrl, { headers });
    const type = image.headers.get("content-type") ?? "";
    if (!image.ok || !type.startsWith("image/")) return c.json({ found: false, reason: `image ${image.status}` });
    picture = { body: await image.arrayBuffer(), type };
  } catch (err) {
    console.error("demo photo fetch failed", err);
    return c.json({ found: false, reason: "fetch failed" });
  }
  const key = `${DEMO_PHOTO_PREFIX}${snackId}`;
  await c.env.PHOTOS.put(key, picture.body, { httpMetadata: { contentType: picture.type } });

  const { results } = await db
    .prepare(
      `SELECT c.id, c.user_id, c.created_at FROM checkins c
        WHERE c.snack_id = ? AND c.id LIKE 'demo-%'
          AND NOT EXISTS (SELECT 1 FROM photos p WHERE p.checkin_id = c.id)`,
    )
    .bind(snackId)
    .all<{ id: string; user_id: string; created_at: number }>();
  const chosen = results.filter((r) => wantsPhoto(r.id));
  // Always give at least one check-in the photo, so every snack gets a picture.
  if (chosen.length === 0 && results.length > 0) chosen.push(results[0]);
  const statements = chosen.flatMap((r) => [
    db
      .prepare("INSERT INTO photos (id, checkin_id, r2_key, status, created_at) VALUES (?, ?, ?, 'visible', ?)")
      .bind(`${DEMO_PREFIX}p-${r.id}`, r.id, key, r.created_at),
    db
      .prepare("INSERT INTO points_ledger (user_id, checkin_id, reason, points, created_at) VALUES (?, ?, 'photo', ?, ?)")
      .bind(r.user_id, r.id, POINTS.photo, r.created_at),
  ]);
  if (statements.length) await db.batch(statements);
  return c.json({ found: true, added: chosen.length });
});

// Remove everything the demo added: photos in R2, groups, then the people
// (their check-ins, points and memberships go with them).
admin.delete("/demo", async (c) => {
  const db = c.env.DB;
  let cursor: string | undefined;
  do {
    const list = await c.env.PHOTOS.list({ prefix: DEMO_PHOTO_PREFIX, cursor });
    if (list.objects.length) await c.env.PHOTOS.delete(list.objects.map((o) => o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  await db.batch([
    db.prepare("DELETE FROM groups WHERE id LIKE 'demo-%'"),
    db.prepare("DELETE FROM users WHERE id LIKE 'demo-%'"),
  ]);
  return c.json({ ok: true });
});

// Maker logos ---------------------------------------------------------------

// The browser shrinks a logo to a small PNG first (src/lib/image.ts).
const MAX_LOGO_BYTES = 512 * 1024;
// No SVG: it can carry scripts, and logos are served from the app's own address.
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

// Every brand on a snack, most snacks first, with its logo if it has one.
admin.get("/brands", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT MIN(TRIM(s.brand)) AS brand, COUNT(*) AS snacks, l.logo_id AS logoId
       FROM snacks s LEFT JOIN brand_logos l ON l.brand_key = LOWER(TRIM(s.brand))
      WHERE s.brand IS NOT NULL AND TRIM(s.brand) != '' AND s.status != 'rejected'
      GROUP BY LOWER(TRIM(s.brand))
      ORDER BY snacks DESC, brand`,
  ).all<BrandRow>();
  return c.json({ brands: results });
});

// Upload or replace a brand's logo: a form with "brand" and a "logo" file.
admin.post("/brands/logo", async (c) => {
  const form = await c.req.parseBody().catch(() => null);
  const brand = typeof form?.brand === "string" ? brandKey(form.brand) : "";
  const logo = form?.logo instanceof File && form.logo.size > 0 ? form.logo : null;
  if (!brand) return c.json({ error: "Which brand is this for?" }, 400);
  if (!logo) return c.json({ error: "Pick a logo image." }, 400);
  if (!LOGO_TYPES.has(logo.type)) return c.json({ error: "Logos must be PNG, JPEG or WebP." }, 400);
  if (logo.size > MAX_LOGO_BYTES) return c.json({ error: "That logo is too big (512 KB max)." }, 400);

  return c.json({ logoId: await saveLogo(c.env, brand, logo.stream(), logo.type) }, 201);
});

/** Store a brand's logo in R2 and point the brand at it, replacing any old one. */
async function saveLogo(env: AppContext["Bindings"], brand: string, body: ReadableStream | ArrayBuffer, type: string) {
  const old = await env.DB.prepare("SELECT logo_id FROM brand_logos WHERE brand_key = ?").bind(brand).first<{ logo_id: string }>();
  const logoId = newId();
  await env.PHOTOS.put(logoKey(logoId), body, { httpMetadata: { contentType: type } });
  await env.DB.prepare(
    `INSERT INTO brand_logos (brand_key, logo_id, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (brand_key) DO UPDATE SET logo_id = excluded.logo_id, updated_at = excluded.updated_at`,
  )
    .bind(brand, logoId, Math.floor(Date.now() / 1000))
    .run();
  if (old) await env.PHOTOS.delete(logoKey(old.logo_id));
  return logoId;
}

// Suggested logos (lib/logoCandidates.ts) ------------------------------------

// Wikidata lookups are cached for a week, so paging through suggestions is quick.
const CANDIDATE_TTL = 7 * 24 * 3600;

/** The next suggestion for a brand that hasn't been rejected, and how many are left after it. */
async function nextSuggestion(env: AppContext["Bindings"], brand: string) {
  const cacheKey = `logo-candidates:v1:${brand}`;
  let candidates = await env.CACHE.get<LogoCandidate[]>(cacheKey, "json");
  if (!candidates) {
    candidates = await findLogoCandidates(brand);
    await env.CACHE.put(cacheKey, JSON.stringify(candidates), { expirationTtl: CANDIDATE_TTL });
  }
  const { results } = await env.DB.prepare("SELECT url FROM brand_logo_rejects WHERE brand_key = ?").bind(brand).all<{ url: string }>();
  const rejected = new Set(results.map((r) => r.url));
  const open = candidates.filter((c) => !rejected.has(c.url));
  return { suggestion: open[0] ?? null, more: Math.max(0, open.length - 1) };
}

// The best logo suggestion for a brand: ?brand=Walkers
admin.get("/brands/suggestion", async (c) => {
  const brand = brandKey(c.req.query("brand") ?? "");
  if (!brand) return c.json({ error: "Which brand?" }, 400);
  try {
    return c.json(await nextSuggestion(c.env, brand));
  } catch {
    return c.json({ error: "Couldn't look up logos just now. Try again in a minute." }, 502);
  }
});

// Use a suggested logo: { brand, url }. The server downloads it and stores its own copy.
admin.post("/brands/suggestion/approve", async (c) => {
  const body = await c.req.json<{ brand?: string; url?: string }>().catch(() => ({}) as { brand?: string; url?: string });
  const brand = brandKey(body.brand ?? "");
  const url = body.url ?? "";
  if (!brand || !isLogoHost(url)) return c.json({ error: "That isn't one of the suggestions." }, 400);

  const res = await fetch(url, { headers: { "User-Agent": "Snackchat/1.0 (logo suggestions)" } }).catch(() => null);
  const type = res?.headers.get("Content-Type")?.split(";")[0].trim() ?? "";
  if (!res?.ok || !isLogoHost(res.url || url) || !LOGO_TYPES.has(type)) {
    return c.json({ error: "Couldn't download that logo. Reject it to see the next one." }, 502);
  }
  const image = await res.arrayBuffer();
  if (image.byteLength > MAX_LOGO_BYTES) return c.json({ error: "That logo is too big. Reject it to see the next one." }, 502);
  return c.json({ logoId: await saveLogo(c.env, brand, image, type) }, 201);
});

// Say no to a suggestion: { brand, url }. Returns the next one.
admin.post("/brands/suggestion/reject", async (c) => {
  const body = await c.req.json<{ brand?: string; url?: string }>().catch(() => ({}) as { brand?: string; url?: string });
  const brand = brandKey(body.brand ?? "");
  if (!brand || !body.url) return c.json({ error: "Which suggestion?" }, 400);
  await c.env.DB.prepare("INSERT OR IGNORE INTO brand_logo_rejects (brand_key, url, created_at) VALUES (?, ?, ?)")
    .bind(brand, body.url, Math.floor(Date.now() / 1000))
    .run();
  try {
    return c.json(await nextSuggestion(c.env, brand));
  } catch {
    return c.json({ error: "Couldn't look up logos just now. Try again in a minute." }, 502);
  }
});

// Remove a brand's logo; its snacks go back to showing nothing.
admin.delete("/brands/logo", async (c) => {
  const brand = brandKey(c.req.query("brand") ?? "");
  const old = await c.env.DB.prepare("DELETE FROM brand_logos WHERE brand_key = ? RETURNING logo_id")
    .bind(brand)
    .first<{ logo_id: string }>();
  if (old) await c.env.PHOTOS.delete(logoKey(old.logo_id));
  return c.json({ ok: true });
});

// Users ---------------------------------------------------------------------

// Everyone, newest first, with demo people at the end.
admin.get("/users", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.avatar_id AS avatarId, u.is_admin AS isAdmin, u.created_at AS joinedAt,
            u.id LIKE 'demo-%' AS isDemo,
            (SELECT COUNT(*) FROM checkins c WHERE c.user_id = u.id) AS checkins,
            (SELECT IFNULL(SUM(p.points), 0) FROM points_ledger p WHERE p.user_id = u.id) AS points,
            (SELECT COUNT(*) FROM group_members g WHERE g.user_id = u.id) AS groups,
            MAX(IFNULL((SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id), 0),
                IFNULL((SELECT MAX(c.created_at) FROM checkins c WHERE c.user_id = u.id), 0)) AS lastActive
       FROM users u
      ORDER BY isDemo, u.created_at DESC`,
  ).all<Omit<AdminUserRow, "isAdmin" | "isDemo"> & { isAdmin: number; isDemo: number }>();
  const users: AdminUserRow[] = results.map((u) => ({
    ...u,
    isAdmin: u.isAdmin === 1,
    isDemo: u.isDemo === 1,
    lastActive: u.lastActive || null,
  }));
  return c.json({ users });
});

// Give someone a new PIN when they've forgotten theirs. The new PIN is shown
// to the admin once, to pass on; the person is signed out everywhere.
admin.post("/users/:id/pin", async (c) => {
  const id = c.req.param("id");
  if (id === currentUser(c).id) return c.json({ error: "That's you. You can't reset your own PIN here." }, 400);
  if (id.startsWith("demo-")) return c.json({ error: "Demo people can't sign in." }, 400);
  const pin = newPin();
  const db = c.env.DB;
  const updated = await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(pin), id).run();
  if (updated.meta.changes !== 1) return c.json({ error: "Person not found." }, 404);
  await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
  return c.json({ pin });
});

// Snacks --------------------------------------------------------------------

// Every snack except merged ones: waiting ones first, then A to Z.
admin.get("/snacks", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.name, s.brand, s.category_id AS category, s.status, s.created_at AS createdAt,
            (SELECT COUNT(*) FROM checkins c WHERE c.snack_id = s.id) AS checkins,
            (${LATEST_PHOTO}) AS photoId,
            u.username AS addedBy
       FROM snacks s LEFT JOIN users u ON u.id = s.created_by
      WHERE s.status != 'merged'
      ORDER BY s.status != 'pending', s.name COLLATE NOCASE`,
  ).all<AdminSnackRow>();
  return c.json({ snacks: results });
});

// Correct a snack's name, maker or type: { name, brand, category }.
admin.patch("/snacks/:id", async (c) => {
  const id = c.req.param("id");
  const parsed = validateSnackFields(await c.req.json().catch(() => null), (key) => !!getCategory(key));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { name, brand, category } = parsed.value;
  const db = c.env.DB;
  const clash = await db
    .prepare(
      `SELECT 1 FROM snacks
        WHERE id != ?1 AND status = 'approved'
          AND name = ?2 COLLATE NOCASE AND IFNULL(brand, '') = ?3 COLLATE NOCASE`,
    )
    .bind(id, name, brand ?? "")
    .first();
  if (clash) return c.json({ error: "Another snack already has that name and maker." }, 409);
  const updated = await db
    .prepare("UPDATE snacks SET name = ?, brand = ?, category_id = ? WHERE id = ? AND status != 'merged'")
    .bind(name, brand, category, id)
    .run();
  if (updated.meta.changes !== 1) return c.json({ error: "Snack not found." }, 404);
  return c.json({ ok: true });
});

// Say yes or no to a snack someone added: { action: "approve" | "reject" }.
// Approved snacks show for everyone; rejected ones disappear from search and
// their page, but check-ins already made on them stay.
admin.post("/snacks/:id/status", async (c) => {
  const action = await readAction(c.req.raw);
  if (!action) return c.json({ error: "Approve or reject?" }, 400);
  const updated = await c.env.DB.prepare("UPDATE snacks SET status = ? WHERE id = ? AND status = 'pending'")
    .bind(action === "approve" ? "approved" : "rejected", c.req.param("id"))
    .run();
  if (updated.meta.changes !== 1) return c.json({ error: "Already dealt with." }, 404);
  return c.json({ ok: true });
});

// A snack's photos that everyone can see, newest first.
admin.get("/snacks/:id/photos", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, u.username, p.created_at AS createdAt
       FROM photos p
       JOIN checkins c ON c.id = p.checkin_id
       JOIN users u ON u.id = c.user_id
      WHERE c.snack_id = ? AND p.status = 'visible'
      ORDER BY p.created_at DESC
      LIMIT 30`,
  )
    .bind(c.req.param("id"))
    .all<AdminSnackPhoto>();
  return c.json({ photos: results });
});

// Hide a photo that's wrong (the wrong snack, blurry, not a snack). It stops
// showing everywhere; the check-in and its points stay. The file is kept, as
// demo photos share one file between several check-ins.
admin.post("/photos/:id/hide", async (c) => {
  const updated = await c.env.DB.prepare("UPDATE photos SET status = 'hidden' WHERE id = ? AND status = 'visible'")
    .bind(c.req.param("id"))
    .run();
  if (updated.meta.changes !== 1) return c.json({ error: "Already hidden." }, 404);
  return c.json({ ok: true });
});

// Diet check (lib/diet.ts) ----------------------------------------------------

// Every snack with its diet labels; ones nobody has checked yet first.
admin.get("/diet", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.name, s.brand, s.category_id AS category, s.vegan, s.gluten_free AS glutenFree,
            s.diet_checked_at AS checkedAt, (${LATEST_PHOTO}) AS photoId
       FROM snacks s
      WHERE s.status IN ('approved', 'pending')
      ORDER BY s.diet_checked_at IS NOT NULL, s.name COLLATE NOCASE`,
  ).all<Omit<DietRow, "vegan" | "glutenFree"> & { vegan: number | null; glutenFree: number | null }>();
  const flag = (v: number | null) => (v === null ? null : v === 1);
  return c.json({ snacks: results.map((r) => ({ ...r, vegan: flag(r.vegan), glutenFree: flag(r.glutenFree) })) });
});

// Looked-up suggestions are kept for 30 days: products rarely change and
// Open Food Facts asks for no more than about 10 searches a minute.
const DIET_TTL = 30 * 24 * 3600;

// What Open Food Facts says about one snack.
admin.get("/diet/:id/suggestion", async (c) => {
  const id = c.req.param("id");
  const cacheKey = `diet-off:v1:${id}`;
  const cached = await c.env.CACHE.get<DietSuggestion>(cacheKey, "json");
  if (cached) return c.json(cached);
  const snack = await c.env.DB.prepare("SELECT name, brand FROM snacks WHERE id = ?").bind(id).first<{ name: string; brand: string | null }>();
  if (!snack) return c.json({ error: "Snack not found." }, 404);
  try {
    const res = await fetch(offDietSearchUrl(snack.name, snack.brand), {
      headers: { "User-Agent": "Snackchat/1.0 (diet check; github.com/jasoneroberts)" },
    });
    if (!res.ok) return c.json({ error: "Open Food Facts is busy. Try again in a minute." }, 502);
    const { products } = (await res.json()) as { products?: OffProduct[] };
    const suggestion = suggestDiet(pickProduct(products ?? [], snack.brand));
    await c.env.CACHE.put(cacheKey, JSON.stringify(suggestion), { expirationTtl: DIET_TTL });
    return c.json(suggestion);
  } catch {
    return c.json({ error: "Couldn't reach Open Food Facts. Try again in a minute." }, 502);
  }
});

// Confirm a snack's labels: { vegan, glutenFree }, each true, false or null (don't know).
admin.put("/diet/:id", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { vegan?: unknown; glutenFree?: unknown } | null;
  const value = (v: unknown) => (v === true ? 1 : v === false ? 0 : v === null ? null : undefined);
  const vegan = value(body?.vegan);
  const glutenFree = value(body?.glutenFree);
  if (vegan === undefined || glutenFree === undefined) return c.json({ error: "Say yes, no or don't know for each." }, 400);
  const updated = await c.env.DB.prepare("UPDATE snacks SET vegan = ?, gluten_free = ?, diet_checked_at = ? WHERE id = ?")
    .bind(vegan, glutenFree, Math.floor(Date.now() / 1000), c.req.param("id"))
    .run();
  if (updated.meta.changes !== 1) return c.json({ error: "Snack not found." }, 404);
  return c.json({ ok: true });
});
