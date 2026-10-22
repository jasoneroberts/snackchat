import { Hono } from "hono";
import { getCategory } from "../../shared/catalogue";
import type { AppContext } from "../env";
import { newId } from "../lib/crypto";
import { currentUser } from "../lib/currentUser";
import { listCheckins } from "../lib/feed";

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
}

// Search, or the most checked-in snacks when there's no search text.
// Pending snacks only show up for the person who added them.
snacks.get("/", async (c) => {
  const user = currentUser(c);
  const q = c.req.query("q")?.trim().slice(0, 60) || null;
  const category = c.req.query("category") || null;
  // Escape LIKE's wildcards so "100%" searches for a literal percent sign.
  const pattern = q ? `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%` : null;

  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.name, s.brand, s.category_id AS category, s.status,
            (SELECT COUNT(*) FROM checkins WHERE snack_id = s.id) AS checkins,
            (SELECT AVG(overall) FROM checkins WHERE snack_id = s.id) AS avg
       FROM snacks s
      WHERE (s.status = 'approved' OR (s.status = 'pending' AND s.created_by = ?1))
        AND (?2 IS NULL OR s.name LIKE ?2 ESCAPE '\\' OR s.brand LIKE ?2 ESCAPE '\\')
        AND (?3 IS NULL OR s.category_id = ?3)
      ORDER BY checkins DESC, s.name
      LIMIT 20`,
  )
    .bind(user.id, pattern, category)
    .all<SnackRow>();

  return c.json({ snacks: results });
});

// Add a snack that isn't in the catalogue yet. It stays "pending" until an
// admin approves it (or, later, three people confirm it).
snacks.post("/", async (c) => {
  const user = currentUser(c);
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  const brand = typeof body?.brand === "string" ? body.brand.trim().replace(/\s+/g, " ") : "";
  const category = typeof body?.category === "string" ? body.category : "";

  if (name.length < 2 || name.length > 80) return c.json({ error: "Snack names are 2 to 80 characters." }, 400);
  if (brand.length > 60) return c.json({ error: "Keep the brand under 60 characters." }, 400);
  if (!getCategory(category)) return c.json({ error: "Pick a snack type." }, 400);

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
  await c.env.DB.prepare(
    "INSERT INTO snacks (id, name, brand, category_id, status, created_by, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
  )
    .bind(id, name, brand || null, category, user.id, now())
    .run();
  return c.json({ snack: { id, name, brand: brand || null, category, status: "pending" } }, 201);
});

// A snack's page: averages, slider averages, rank in its category, recent check-ins.
snacks.get("/:id", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;

  const snack = await db
    .prepare("SELECT id, name, brand, category_id AS category, status, country FROM snacks WHERE id = ?")
    .bind(id)
    .first<{ id: string; name: string; brand: string | null; category: string; status: string; country: string }>();
  if (!snack || snack.status === "rejected") return c.json({ error: "Snack not found." }, 404);

  const [stats, attrs, rank, checkins] = await Promise.all([
    db
      .prepare("SELECT COUNT(*) AS count, AVG(overall) AS avg FROM checkins WHERE snack_id = ?")
      .bind(id)
      .first<{ count: number; avg: number | null }>(),
    db
      .prepare(
        `SELECT a.attribute, AVG(a.value) AS avg, COUNT(*) AS count
           FROM checkin_attributes a JOIN checkins c ON c.id = a.checkin_id
          WHERE c.snack_id = ?
          GROUP BY a.attribute`,
      )
      .bind(id)
      .all<{ attribute: string; avg: number; count: number }>(),
    // Rank among snacks of the same type that have at least one check-in.
    db
      .prepare(
        `SELECT rank, total FROM (
           SELECT c.snack_id, RANK() OVER (ORDER BY AVG(c.overall) DESC) AS rank, COUNT(*) OVER () AS total
             FROM checkins c JOIN snacks s ON s.id = c.snack_id
            WHERE s.category_id = ?
            GROUP BY c.snack_id)
          WHERE snack_id = ?`,
      )
      .bind(snack.category, id)
      .first<{ rank: number; total: number }>(),
    listCheckins(db, { viewerId: user.id, snackId: id, limit: 20 }),
  ]);

  return c.json({
    snack,
    count: stats?.count ?? 0,
    avg: stats?.avg ?? null,
    attributes: Object.fromEntries(attrs.results.map((a) => [a.attribute, a.avg])),
    rank: rank ? { position: rank.rank, of: rank.total } : null,
    checkins,
  });
});
