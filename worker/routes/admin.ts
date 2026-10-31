import { totalPointsSql } from "../lib/boards";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AdminReport, AdminSnackPhoto, AdminSnackRow, AdminUserRow, BrandRow, DemoStatus, DietRow, ReviewQueue } from "../../shared/types";
import type { AppContext } from "../env";
import { getCategory, POINTS } from "../../shared/catalogue";
import { deleteAccount } from "../lib/account";
import { currentUser } from "../lib/currentUser";
import { DEMO_PHOTO_PREFIX, DEMO_PREFIX } from "../lib/demo";
import { type DietSuggestion, offDietSearchUrl, type OffProduct, pickProduct, suggestDiet } from "../lib/diet";
import { fetchLogo, findLogoCandidates, LOGO_TYPES, type LogoCandidate, MAX_LOGO_BYTES } from "../lib/logoCandidates";
import { brandKey } from "../../shared/brands";
import { hashPassword, newId } from "../lib/crypto";
import { LATEST_PHOTO } from "../lib/photoSql";
import { newPin } from "../lib/quickSignIn";
import { validateSnackFields } from "../lib/validation";
import { avatarKey } from "./avatars";
import { clearWrongPins } from "../lib/pinLock";
import { health } from "./health";
import { logoKey } from "./logos";

// Photo approval. Every new check-in photo and profile picture waits here
// until an admin approves or rejects it. (An AI check could later approve the
// obvious ones before they reach this queue.)
export const admin = new Hono<AppContext>();

admin.use("*", async (c, next) => {
  if (currentUser(c).is_admin !== 1) throw new HTTPException(403, { message: "Admins only." });
  await next();
});

// Audit log: every change an admin makes (anything but a GET) is written
// down with who did it and when. Settings > Health shows the list.
admin.use("*", async (c, next) => {
  await next();
  const method = c.req.method;
  const path = c.req.path.replace(/^\/api\/admin/, "") || "/";
  if (method === "GET" || method === "HEAD") return;
  let detail: string | null = null;
  if (c.req.header("Content-Type")?.includes("application/json")) {
    // Hono keeps the body the route already read, so this reads it again for free.
    detail = await c.req
      .json()
      .then((b) => JSON.stringify(b).slice(0, 500))
      .catch(() => null);
  }
  const user = currentUser(c);
  try {
    await c.env.DB.prepare(
      `INSERT INTO admin_audit_log (admin_id, admin_name, method, path, status, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(user.id, user.username, method, path, c.res.status, detail, Math.floor(Date.now() / 1000))
      .run();
  } catch (err) {
    // Never fail the admin's action just because the log couldn't be written.
    console.error("audit log", err);
  }
});

admin.route("/health", health);

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

/** Reported things waiting for an admin (several reports of one thing count once). */
export async function openReportCount(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM (SELECT 1 FROM reports WHERE resolved = 0 GROUP BY target_type, target_id)")
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

// Demo data ---------------------------------------------------------------

// Crunchd went public on 2026-10-30, so made-up people and check-ins can no
// longer be added (UK law, the DMCC Act 2024, bans fake reviews). The ways to
// load them are gone; what's left is checking for leftovers and removing them.

/** How much demo data is still loaded, so Settings can offer to remove it. */
admin.get("/demo", async (c) => {
  const counts = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM users WHERE id LIKE 'demo-%') AS users,
            (SELECT COUNT(*) FROM checkins WHERE id LIKE 'demo-%') AS checkins,
            (SELECT COUNT(*) FROM photos WHERE id LIKE 'demo-%') AS photos`,
  ).first<DemoStatus>();
  return c.json({ users: counts?.users ?? 0, checkins: counts?.checkins ?? 0, photos: counts?.photos ?? 0 } satisfies DemoStatus);
});

// Remove everything the demo added: photos and pictures in R2, groups, then the people
// (their check-ins, points and memberships go with them).
admin.delete("/demo", async (c) => {
  const db = c.env.DB;
  let cursor: string | undefined;
  do {
    const list = await c.env.PHOTOS.list({ prefix: DEMO_PHOTO_PREFIX, cursor });
    if (list.objects.length) await c.env.PHOTOS.delete(list.objects.map((o) => o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  // Their profile pictures live with everyone else's, under avatars/demo-*.
  do {
    const list = await c.env.PHOTOS.list({ prefix: `avatars/${DEMO_PREFIX}`, cursor });
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

// How many candidates one request will try before giving up for now.
const MAX_TRIES = 4;

/**
 * The next suggestion for a brand that hasn't been rejected and actually
 * downloads as a usable image, and how many are left after it. Candidates
 * that don't download are rejected automatically, so the admin never sees a
 * suggestion that can't be approved.
 */
async function nextSuggestion(env: AppContext["Bindings"], brand: string) {
  const cacheKey = `logo-candidates:v2:${brand}`;
  let candidates = await env.CACHE.get<LogoCandidate[]>(cacheKey, "json");
  if (!candidates) {
    candidates = await findLogoCandidates(brand);
    await env.CACHE.put(cacheKey, JSON.stringify(candidates), { expirationTtl: CANDIDATE_TTL });
  }
  const { results } = await env.DB.prepare("SELECT url FROM brand_logo_rejects WHERE brand_key = ?").bind(brand).all<{ url: string }>();
  const rejected = new Set(results.map((r) => r.url));
  const open = candidates.filter((c) => !rejected.has(c.url));
  for (let i = 0; i < open.length && i < MAX_TRIES; i++) {
    const check = await fetchLogo(open[i].url);
    if (check.ok) return { suggestion: open[i], more: open.length - i - 1 };
    console.log("logo suggestion skipped", brand, open[i].url, check.reason);
    await rejectSuggestion(env, brand, open[i].url);
  }
  // Tried a few that didn't work; any left get tried next time.
  const left = Math.max(0, open.length - MAX_TRIES);
  return { suggestion: null, more: left };
}

const rejectSuggestion = (env: AppContext["Bindings"], brand: string, url: string) =>
  env.DB.prepare("INSERT OR IGNORE INTO brand_logo_rejects (brand_key, url, created_at) VALUES (?, ?, ?)")
    .bind(brand, url, Math.floor(Date.now() / 1000))
    .run();

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
// If it won't download after all, it's rejected and the next suggestion comes back instead.
admin.post("/brands/suggestion/approve", async (c) => {
  const body = await c.req.json<{ brand?: string; url?: string }>().catch(() => ({}) as { brand?: string; url?: string });
  const brand = brandKey(body.brand ?? "");
  const url = body.url ?? "";
  if (!brand || !url) return c.json({ error: "That isn't one of the suggestions." }, 400);

  const logo = await fetchLogo(url);
  if (!logo.ok) {
    if (logo.reason === "not an allowed host") return c.json({ error: "That isn't one of the suggestions." }, 400);
    await rejectSuggestion(c.env, brand, url);
    try {
      return c.json({ failed: true, ...(await nextSuggestion(c.env, brand)) });
    } catch {
      return c.json({ error: "Couldn't look up logos just now. Try again in a minute." }, 502);
    }
  }
  return c.json({ logoId: await saveLogo(c.env, brand, logo.body, logo.type) }, 201);
});

// Say no to a suggestion: { brand, url }. Returns the next one.
admin.post("/brands/suggestion/reject", async (c) => {
  const body = await c.req.json<{ brand?: string; url?: string }>().catch(() => ({}) as { brand?: string; url?: string });
  const brand = brandKey(body.brand ?? "");
  if (!brand || !body.url) return c.json({ error: "Which suggestion?" }, 400);
  await rejectSuggestion(c.env, brand, body.url);
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
  // Looking at the list clears the "new people" count on the Me tab.
  await c.env.DB.prepare("UPDATE users SET users_seen_at = unixepoch() WHERE id = ?").bind(currentUser(c).id).run();
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.avatar_id AS avatarId, u.is_admin AS isAdmin, u.created_at AS joinedAt,
            u.signup_ref AS signupRef, u.id LIKE 'demo-%' AS isDemo,
            (SELECT iu.username FROM referrals r JOIN users iu ON iu.id = r.inviter_id WHERE r.friend_id = u.id) AS invitedBy,
            (SELECT COUNT(*) FROM checkins c WHERE c.user_id = u.id) AS checkins,
            (${totalPointsSql("u.id")}) AS points,
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
  await clearWrongPins(c.env.CACHE, id);
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

// A snack's photos that everyone can see, newest first, marking the one picked
// as its main picture. (Photos from private profiles never show on a snack.)
admin.get("/snacks/:id/photos", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, u.username, p.created_at AS createdAt,
            p.id = (SELECT cover_photo_id FROM snacks WHERE id = c.snack_id) AS isCover
       FROM photos p
       JOIN checkins c ON c.id = p.checkin_id
       JOIN users u ON u.id = c.user_id
      WHERE c.snack_id = ? AND p.status = 'visible' AND u.is_private = 0
      ORDER BY p.created_at DESC
      LIMIT 30`,
  )
    .bind(c.req.param("id"))
    .all<Omit<AdminSnackPhoto, "isCover"> & { isCover: number | null }>();
  return c.json({ photos: results.map((p) => ({ ...p, isCover: p.isCover === 1 })) });
});

// Pick a snack's main picture from its photos: { photoId }, or { photoId: null }
// to go back to the newest photo.
admin.put("/snacks/:id/cover", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { photoId?: unknown } | null;
  const photoId = typeof body?.photoId === "string" ? body.photoId : null;
  const db = c.env.DB;
  if (photoId) {
    const ok = await db
      .prepare(
        `SELECT 1 FROM photos p JOIN checkins c ON c.id = p.checkin_id
           JOIN users u ON u.id = c.user_id
          WHERE p.id = ? AND c.snack_id = ? AND p.status = 'visible' AND u.is_private = 0`,
      )
      .bind(photoId, c.req.param("id"))
      .first();
    if (!ok) return c.json({ error: "That photo isn't one of this snack's." }, 400);
  }
  const updated = await db.prepare("UPDATE snacks SET cover_photo_id = ? WHERE id = ?").bind(photoId, c.req.param("id")).run();
  if (updated.meta.changes !== 1) return c.json({ error: "Snack not found." }, 404);
  return c.json({ ok: true });
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
      headers: { "User-Agent": "Crunchd/1.0 (diet check; github.com/jasoneroberts)" },
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

// Reports (routes/safety.ts) ---------------------------------------------------

// Everything reported and not dealt with yet, oldest first, with a look at
// what was reported so it can be judged here.
admin.get("/reports", async (c) => {
  const db = c.env.DB;
  const { results } = await db
    .prepare(
      `SELECT r.target_type AS targetType, r.target_id AS targetId, r.reason, r.note, u.username AS reporter, r.created_at AS createdAt
         FROM reports r JOIN users u ON u.id = r.reporter_id
        WHERE r.resolved = 0
        ORDER BY r.created_at
        LIMIT 200`,
    )
    .all<{ targetType: AdminReport["targetType"]; targetId: string; reason: string; note: string | null; reporter: string; createdAt: number }>();

  const byTarget = new Map<string, AdminReport>();
  for (const { targetType, targetId, ...report } of results) {
    const key = `${targetType}:${targetId}`;
    if (!byTarget.has(key)) byTarget.set(key, { targetType, targetId, reports: [] });
    byTarget.get(key)!.reports.push(report);
  }
  const items = [...byTarget.values()];
  await Promise.all(
    items.map(async (item) => {
      if (item.targetType === "checkin") {
        item.checkin =
          (await db
            .prepare(
              `SELECT u.username, s.name AS snackName, c.review, c.venue_text AS venue, c.paired_with AS pairedWith, c.created_at AS createdAt,
                      (SELECT id FROM photos WHERE checkin_id = c.id AND status IN ('visible', 'pending') LIMIT 1) AS photoId
                 FROM checkins c JOIN users u ON u.id = c.user_id JOIN snacks s ON s.id = c.snack_id
                WHERE c.id = ?`,
            )
            .bind(item.targetId)
            .first<NonNullable<AdminReport["checkin"]>>()) ?? undefined;
      } else if (item.targetType === "user") {
        const u = await db
          .prepare(
            `SELECT username, avatar_id AS avatarId, created_at AS joinedAt, is_admin AS isAdmin,
                    (SELECT COUNT(*) FROM checkins WHERE user_id = users.id) AS checkins
               FROM users WHERE id = ?`,
          )
          .bind(item.targetId)
          .first<Omit<NonNullable<AdminReport["user"]>, "isAdmin"> & { isAdmin: number }>();
        item.user = u ? { ...u, isAdmin: u.isAdmin === 1 } : undefined;
      } else {
        item.snack =
          (await db.prepare("SELECT id, name, brand, status FROM snacks WHERE id = ?").bind(item.targetId).first<NonNullable<AdminReport["snack"]>>()) ??
          undefined;
      }
    }),
  );
  return c.json({ reports: items });
});

const REPORT_ACTIONS = {
  checkin: ["dismiss", "remove-text", "hide-photo", "delete-checkin"],
  user: ["dismiss", "remove-avatar", "delete-account"],
  snack: ["dismiss"],
} as const;

// Deal with a reported thing: { action }. Every open report about it is
// marked done with what was decided.
admin.post("/reports/:type/:id", async (c) => {
  const type = c.req.param("type") as keyof typeof REPORT_ACTIONS;
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  if (!(type in REPORT_ACTIONS) || !(REPORT_ACTIONS[type] as readonly unknown[]).includes(action)) {
    return c.json({ error: "Unknown action." }, 400);
  }
  const db = c.env.DB;
  const me = currentUser(c);

  if (action === "remove-text") {
    await db.prepare("UPDATE checkins SET review = NULL, venue_text = NULL, paired_with = NULL WHERE id = ?").bind(id).run();
  } else if (action === "hide-photo") {
    await db.prepare("UPDATE photos SET status = 'hidden' WHERE checkin_id = ? AND status IN ('visible', 'pending')").bind(id).run();
  } else if (action === "delete-checkin") {
    const photos = await db.prepare("SELECT r2_key FROM photos WHERE checkin_id = ?").bind(id).all<{ r2_key: string }>();
    await db.prepare("UPDATE snacks SET cover_photo_id = NULL WHERE cover_photo_id IN (SELECT id FROM photos WHERE checkin_id = ?)").bind(id).run();
    await db.prepare("DELETE FROM checkins WHERE id = ?").bind(id).run();
    const keys = photos.results.map((p) => p.r2_key).filter((k) => !k.startsWith(DEMO_PHOTO_PREFIX));
    if (keys.length) await c.env.PHOTOS.delete(keys);
  } else if (action === "remove-avatar") {
    const user = await db.prepare("SELECT avatar_id FROM users WHERE id = ?").bind(id).first<{ avatar_id: string | null }>();
    await db.prepare("UPDATE users SET avatar_id = NULL WHERE id = ?").bind(id).run();
    if (user?.avatar_id) await c.env.PHOTOS.delete(avatarKey(id, user.avatar_id));
  } else if (action === "delete-account") {
    const user = await db.prepare("SELECT is_admin FROM users WHERE id = ?").bind(id).first<{ is_admin: number }>();
    if (!user) return c.json({ error: "Already gone." }, 404);
    if (id === me.id || user.is_admin === 1) return c.json({ error: "Admins can't be deleted from here." }, 400);
    await deleteAccount(c.env, id);
  }

  await db
    .prepare(
      `UPDATE reports SET resolved = 1, resolved_at = ?, outcome = ?
        WHERE resolved = 0 AND target_type = ? AND target_id = ?`,
    )
    .bind(Math.floor(Date.now() / 1000), action as string, type, id)
    .run();
  return c.json({ ok: true });
});
