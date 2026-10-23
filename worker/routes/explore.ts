import { Hono } from "hono";
import { getCategory } from "../../shared/catalogue";
import type { ExplorePage, Preferences, SnackSummary, Suggestion } from "../../shared/types";
import type { AppContext } from "../env";
import { weightedRating } from "../lib/boards";
import { currentUser } from "../lib/currentUser";
import { PREFERENCE_KEYS, rankMatches, readPreferences, withImpliedSpice } from "../lib/explore";
import { LATEST_PHOTO } from "../lib/photoSql";

export const explore = new Hono<AppContext>();

const now = () => Math.floor(Date.now() / 1000);
const SUGGESTIONS = 20;
const KEYS_SQL = PREFERENCE_KEYS.map(() => "?").join(", ");

/** Someone's saved preferences, or null if they've never set any. */
export async function getPreferences(db: D1Database, userId: string): Promise<Preferences | null> {
  const row = await db
    .prepare(`SELECT ${PREFERENCE_KEYS.join(", ")} FROM taste_preferences WHERE user_id = ?`)
    .bind(userId)
    .first<Record<string, number | null>>();
  if (!row) return null;
  return Object.fromEntries(PREFERENCE_KEYS.filter((k) => row[k] != null).map((k) => [k, row[k]!]));
}

// Your preferences, the best-matching snacks you haven't tried, and your saved list.
// ?category=crisps narrows the suggestions to one snack type.
explore.get("/", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const category = getCategory(c.req.query("category") ?? "")?.id ?? null;

  const [preferences, snacks, averages, saved] = await Promise.all([
    getPreferences(db, user.id),
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
    // Everyone's average for each universal slider, per snack.
    db
      .prepare(
        `SELECT c.snack_id AS snackId, a.attribute, AVG(a.value) AS avg
           FROM checkin_attributes a JOIN checkins c ON c.id = a.checkin_id
          WHERE a.attribute IN (${KEYS_SQL})
          GROUP BY c.snack_id, a.attribute`,
      )
      .bind(...PREFERENCE_KEYS)
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
  if (preferences) {
    const bySnack = new Map<string, Record<string, number>>();
    for (const a of averages.results) {
      const m = bySnack.get(a.snackId) ?? {};
      m[a.attribute] = a.avg;
      bySnack.set(a.snackId, m);
    }
    const total = snacks.results.reduce((n, s) => n + s.count, 0);
    const mean = total ? snacks.results.reduce((sum, s) => sum + s.avg * s.count, 0) / total : 0;
    const ranked = rankMatches(
      preferences,
      snacks.results.map((s) => ({ ...s, averages: withImpliedSpice(bySnack.get(s.id) ?? {}, s.category), rating: weightedRating(s.avg, s.count, mean) })),
    );
    suggestions = ranked.slice(0, SUGGESTIONS).map((s) => ({
      snack: { id: s.id, name: s.name, brand: s.brand, category: s.category, status: s.status, photoId: s.photoId },
      match: s.match,
      avg: s.avg,
      count: s.count,
      averages: s.averages,
    }));
  }

  return c.json({ preferences, suggestions, saved: saved.results } satisfies ExplorePage);
});

// Set your taste preferences (replaces what was there).
explore.put("/preferences", async (c) => {
  const user = currentUser(c);
  const prefs = readPreferences(await c.req.json().catch(() => null));
  if (!prefs) return c.json({ error: "Each preference must be 1 to 5, or left blank." }, 400);
  const values = PREFERENCE_KEYS.map((k) => prefs[k] ?? null);
  await c.env.DB.prepare(
    `INSERT INTO taste_preferences (user_id, ${PREFERENCE_KEYS.join(", ")}, updated_at)
     VALUES (?, ${KEYS_SQL}, ?)
     ON CONFLICT (user_id) DO UPDATE SET ${PREFERENCE_KEYS.map((k) => `${k} = excluded.${k}`).join(", ")},
       updated_at = excluded.updated_at`,
  )
    .bind(user.id, ...values, now())
    .run();
  return c.json({ preferences: prefs });
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
