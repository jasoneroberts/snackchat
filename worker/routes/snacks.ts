import { Hono } from "hono";
import { getCategory } from "../../shared/catalogue";
import type { SnackSummary } from "../../shared/types";
import type { AppContext } from "../env";
import { newId } from "../lib/crypto";
import { currentUser } from "../lib/currentUser";
import { overDailyLimit } from "../lib/limits";
import { BOARD_AVG_SQL, rankingAverage } from "../lib/boards";
import { pingAdmins } from "../lib/notify";
import { listCheckins } from "../lib/feed";
import { LATEST_PHOTO } from "../lib/photoSql";
import { searchPatterns } from "../lib/search";
import { validateSnackFields } from "../lib/validation";

export const snacks = new Hono<AppContext>();

const now = () => Math.floor(Date.now() / 1000);

interface SnackRow {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  status: string;
  checkins: number;
  avg: number | null;
  photoId: string | null;
}


// Search, or the most checked-in snacks when there's no search text. Every
// word must appear in the name or brand. Pending snacks only show up for the
// person who added them. photoId is the newest public photo, for thumbnails.
snacks.get("/", async (c) => {
  const user = currentUser(c);
  const patterns = searchPatterns(c.req.query("q"));
  const category = c.req.query("category") || null;
  const wordFilters = patterns.map(() => "AND REPLACE(s.name || ' ' || IFNULL(s.brand, ''), '''', '') LIKE ? ESCAPE '\\'").join("\n        ");

  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.name, s.brand, s.category_id AS category, s.status,
            (SELECT COUNT(*) FROM checkins WHERE snack_id = s.id AND scored = 1) AS checkins,
            (SELECT AVG(overall) FROM checkins WHERE snack_id = s.id AND scored = 1) AS avg,
            (${LATEST_PHOTO}) AS photoId
       FROM snacks s
      WHERE (s.status = 'approved' OR (s.status = 'pending' AND s.created_by = ?))
        AND (? IS NULL OR s.category_id = ?)
        ${wordFilters}
      ORDER BY checkins DESC, s.name
      LIMIT 20`,
  )
    .bind(user.id, category, category, ...patterns)
    .all<SnackRow>();

  return c.json({ snacks: results });
});

// Add a snack that isn't in the catalogue yet. It stays "pending" until an
// admin approves it (or, later, three people confirm it).
snacks.post("/", async (c) => {
  const user = currentUser(c);
  const tooMany = await overDailyLimit(c, "snacks");
  if (tooMany) return c.json({ error: tooMany }, 429);
  const parsed = validateSnackFields(await c.req.json().catch(() => null), (id) => !!getCategory(id));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { name, category } = parsed.value;
  const brand = parsed.value.brand ?? "";

  // Same name and brand as an existing snack? Use that one instead of a duplicate.
  const existing = await c.env.DB.prepare(
    `SELECT id, name, brand, category_id AS category, status FROM snacks
      WHERE name = ?1 COLLATE NOCASE AND IFNULL(brand, '') = ?2 COLLATE NOCASE
        AND (status = 'approved' OR (status = 'pending' AND created_by = ?3))
      LIMIT 1`,
  )
    .bind(name, brand, user.id)
    .first();
  if (existing) return c.json({ snack: existing });

  const id = newId();
  // An admin's new snack is in the catalogue straight away; anyone else's waits for one.
  const status = user.is_admin === 1 ? "approved" : "pending";
  await c.env.DB.prepare(
    "INSERT INTO snacks (id, name, brand, category_id, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, name, brand || null, category, status, user.id, now())
    .run();
  if (status === "pending") {
    pingAdmins(
      c,
      { kind: "snack", title: "New snack to check", body: `${user.username} added ${brand ? `${brand} ` : ""}${name}.`, url: "/admin/snacks" },
      user.id,
    );
  }
  return c.json({ snack: { id, name, brand: brand || null, category, status } }, 201);
});

// Makers people have used on approved snacks, most-used first, to suggest
// as you type when adding a snack (so it's "KP", not a new spelling of it).
snacks.get("/brands", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT brand FROM snacks WHERE status = 'approved' AND brand IS NOT NULL
      GROUP BY brand COLLATE NOCASE ORDER BY COUNT(*) DESC, brand LIMIT 200`,
  ).all<{ brand: string }>();
  return c.json({ brands: results.map((r) => r.brand) });
});

// Every approved snack, A to Z, for Settings > All snacks (where people can
// ask for a snack's details or photo to be changed).
snacks.get("/all", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.name, s.brand, s.category_id AS category, s.status, (${LATEST_PHOTO}) AS photoId,
            (SELECT COUNT(*) FROM checkins c WHERE c.snack_id = s.id) AS checkins
       FROM snacks s WHERE s.status = 'approved'
      ORDER BY s.name COLLATE NOCASE, s.brand COLLATE NOCASE`,
  ).all<SnackSummary & { checkins: number }>();
  return c.json({ snacks: results });
});

// A snack's page: averages, slider averages, rank in its category, recent check-ins.
snacks.get("/:id", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;

  const snack = await db
    .prepare(
      `SELECT s.id, s.name, s.brand, s.category_id AS category, s.status, s.country, (${LATEST_PHOTO}) AS photoId,
              s.vegan, s.gluten_free
         FROM snacks s WHERE s.id = ?`,
    )
    .bind(id)
    .first<{
      id: string;
      name: string;
      brand: string | null;
      category: string;
      status: string;
      country: string;
      photoId: string | null;
      vegan: number | null;
      gluten_free: number | null;
    }>();
  if (!snack || snack.status === "rejected") return c.json({ error: "Snack not found." }, 404);

  const [stats, attrs, rank, checkins] = await Promise.all([
    db
      .prepare("SELECT COUNT(*) AS count, AVG(overall) AS avg FROM checkins WHERE snack_id = ? AND scored = 1")
      .bind(id)
      .first<{ count: number; avg: number | null }>(),
    db
      .prepare(
        `SELECT a.attribute, AVG(a.value) AS avg, COUNT(*) AS count
           FROM checkin_attributes a JOIN checkins c ON c.id = a.checkin_id
          WHERE c.snack_id = ? AND c.scored = 1
          GROUP BY a.attribute`,
      )
      .bind(id)
      .all<{ attribute: string; avg: number; count: number }>(),
    // Rank among snacks of the same type that have at least one check-in.
    db
      .prepare(
        `SELECT rank, total FROM (
           SELECT c.snack_id, RANK() OVER (ORDER BY ${BOARD_AVG_SQL} DESC) AS rank, COUNT(*) OVER () AS total
             FROM checkins c JOIN snacks s ON s.id = c.snack_id
            WHERE s.category_id = ? AND c.scored = 1
            GROUP BY c.snack_id)
          WHERE snack_id = ?`,
      )
      .bind(snack.category, id)
      .first<{ rank: number; total: number }>(),
    listCheckins(db, { viewerId: user.id, snackId: id, limit: 20 }),
  ]);

  return c.json({
    snack: {
      id: snack.id,
      name: snack.name,
      brand: snack.brand,
      category: snack.category,
      status: snack.status,
      country: snack.country,
      photoId: snack.photoId,
      vegan: snack.vegan === null ? null : snack.vegan === 1,
      glutenFree: snack.gluten_free === null ? null : snack.gluten_free === 1,
    },
    count: stats?.count ?? 0,
    // A lone rating is averaged with the stand-in 2.5, as on the Table (lib/boards.ts).
    avg: stats?.avg == null ? null : rankingAverage(stats.avg, stats.count).avg,
    attributes: Object.fromEntries(attrs.results.map((a) => [a.attribute, a.avg])),
    rank: rank ? { position: rank.rank, of: rank.total } : null,
    checkins,
  });
});
