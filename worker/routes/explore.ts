import { Hono } from "hono";
import { attributesFor, getCategory } from "../../shared/catalogue";
import type { ExplorePage, Preferences, SnackSummary, Suggestion } from "../../shared/types";
import type { AppContext } from "../env";
import { weightedRating } from "../lib/boards";
import { currentUser } from "../lib/currentUser";
import { rankMatches, readPreferences } from "../lib/explore";
import { LATEST_PHOTO } from "../lib/photoSql";

export const explore = new Hono<AppContext>();

const now = () => Math.floor(Date.now() / 1000);
const SUGGESTIONS = 20;
/** Someone's taste for each snack type they've set one for: { crisps: { salt: 4, ... } }. */
async function getTastes(db: D1Database, userId: string): Promise<Record<string, Preferences>> {
  const { results } = await db
    .prepare("SELECT category_id AS category, attribute, value FROM taste_by_type WHERE user_id = ?")
    .bind(userId)
    .all<{ category: string; attribute: string; value: number }>();
  const tastes: Record<string, Preferences> = {};
  for (const r of results) (tastes[r.category] ??= {})[r.attribute] = r.value;
  return tastes;
}

// Your taste for each type, the best-matching snacks you haven't tried, and
// your saved list. Each snack is matched on your taste for its own type, so
// types you haven't set a taste for aren't suggested.
// ?category=crisps narrows the suggestions to one snack type.
explore.get("/", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const category = getCategory(c.req.query("category") ?? "")?.id ?? null;

  const [tastes, snacks, averages, saved] = await Promise.all([
    getTastes(db, user.id),
    // Approved snacks with at least one check-in, leaving out ones you've
    // already checked in, saved or discarded.
    db
      .prepare(
        `SELECT s.id, s.name, s.brand, s.category_id AS category, s.status,
                AVG(c.overall) AS avg, COUNT(*) AS count, (${LATEST_PHOTO}) AS photoId
           FROM checkins c JOIN snacks s ON s.id = c.snack_id
          WHERE s.status = 'approved'
            AND s.id NOT IN (SELECT snack_id FROM checkins WHERE user_id = ?1)
            AND s.id NOT IN (SELECT snack_id FROM explore_choices WHERE user_id = ?1)
            AND (?2 IS NULL OR s.category_id = ?2)
          GROUP BY s.id`,
      )
      .bind(user.id, category)
      .all<SnackSummary & { avg: number; count: number }>(),
    // Everyone's average for each slider, per snack.
    db
      .prepare(
        `SELECT c.snack_id AS snackId, a.attribute, AVG(a.value) AS avg
           FROM checkin_attributes a JOIN checkins c ON c.id = a.checkin_id
          GROUP BY c.snack_id, a.attribute`,
      )
      .all<{ snackId: string; attribute: string; avg: number }>(),
    // Saved snacks you haven't checked in yet (once you have, they drop off).
    db
      .prepare(
        `SELECT s.id, s.name, s.brand, s.category_id AS category, s.status, (${LATEST_PHOTO}) AS photoId
           FROM explore_choices e JOIN snacks s ON s.id = e.snack_id
          WHERE e.user_id = ?1 AND e.choice = 'saved'
            AND s.id NOT IN (SELECT snack_id FROM checkins WHERE user_id = ?1)
          ORDER BY e.created_at DESC`,
      )
      .bind(user.id)
      .all<SnackSummary>(),
  ]);

  let suggestions: Suggestion[] = [];
  if (Object.keys(tastes).length) {
    const bySnack = new Map<string, Record<string, number>>();
    for (const a of averages.results) {
      const m = bySnack.get(a.snackId) ?? {};
      m[a.attribute] = a.avg;
      bySnack.set(a.snackId, m);
    }
    const total = snacks.results.reduce((n, s) => n + s.count, 0);
    const mean = total ? snacks.results.reduce((sum, s) => sum + s.avg * s.count, 0) / total : 0;
    const ranked = rankMatches(
      snacks.results
        .filter((s) => tastes[s.category])
        .map((s) => ({ ...s, prefs: tastes[s.category], averages: bySnack.get(s.id) ?? {}, rating: weightedRating(s.avg, s.count, mean) })),
    );
    suggestions = ranked.slice(0, SUGGESTIONS).map((s) => ({
      snack: { id: s.id, name: s.name, brand: s.brand, category: s.category, status: s.status, photoId: s.photoId },
      match: s.match,
      avg: s.avg,
      count: s.count,
      averages: s.averages,
    }));
  }

  return c.json({ tastes, suggestions, saved: saved.results } satisfies ExplorePage);
});

// Set your taste for one snack type (replaces what was there): PUT /taste/crisps
// with { salt: 4, crunch: 5, spice: null, ... }. Only that type's sliders count.
explore.put("/taste/:category", async (c) => {
  const user = currentUser(c);
  const category = getCategory(c.req.param("category"));
  if (!category) return c.json({ error: "Pick a snack type." }, 400);
  const prefs = readPreferences(await c.req.json().catch(() => null), attributesFor(category.id).map((a) => a.key));
  if (!prefs) return c.json({ error: "Each preference must be 1 to 5, or left blank." }, 400);
  const db = c.env.DB;
  await db.batch([
    db.prepare("DELETE FROM taste_by_type WHERE user_id = ? AND category_id = ?").bind(user.id, category.id),
    ...Object.entries(prefs).map(([attribute, value]) =>
      db
        .prepare("INSERT INTO taste_by_type (user_id, category_id, attribute, value) VALUES (?, ?, ?, ?)")
        .bind(user.id, category.id, attribute, value!),
    ),
  ]);
  return c.json({ taste: prefs });
});

// Save a suggestion to try later, or discard it so it isn't suggested again.
explore.post("/:snackId", async (c) => {
  const user = currentUser(c);
  const body = await c.req.json<{ choice?: string }>().catch(() => ({ choice: undefined }));
  if (body.choice !== "saved" && body.choice !== "discarded") return c.json({ error: "Choose saved or discarded." }, 400);
  const snack = await c.env.DB.prepare("SELECT id FROM snacks WHERE id = ? AND status = 'approved'")
    .bind(c.req.param("snackId"))
    .first();
  if (!snack) return c.json({ error: "Snack not found." }, 404);
  await c.env.DB.prepare(
    `INSERT INTO explore_choices (user_id, snack_id, choice, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, snack_id) DO UPDATE SET choice = excluded.choice, created_at = excluded.created_at`,
  )
    .bind(user.id, c.req.param("snackId"), body.choice, now())
    .run();
  return c.json({ ok: true });
});

// Undo a save or discard: the snack can be suggested again.
explore.delete("/:snackId", async (c) => {
  const user = currentUser(c);
  await c.env.DB.prepare("DELETE FROM explore_choices WHERE user_id = ? AND snack_id = ?")
    .bind(user.id, c.req.param("snackId"))
    .run();
  return c.json({ ok: true });
});
