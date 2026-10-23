import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { BrandRow, DemoStatus, ReviewQueue } from "../../shared/types";
import type { AppContext } from "../env";
import { POINTS } from "../../shared/catalogue";
import { currentUser } from "../lib/currentUser";
import { buildDemoData, DEMO_GROUPS, DEMO_PHOTO_PREFIX, DEMO_PREFIX, demoUserId, offSearchUrl, wantsPhoto } from "../lib/demo";
import { newInviteCode } from "../lib/groups";
import { findLogoCandidates, isLogoHost, type LogoCandidate } from "../lib/logoCandidates";
import { brandKey } from "../../shared/brands";
import { newId } from "../lib/crypto";
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
