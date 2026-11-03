/**
 * Merging two catalogue entries for the same snack.
 *
 * When two people add the same snack under slightly different names (or the
 * wrong maker), an admin can't just rename one to match the other: renaming
 * refuses a name and maker another snack already has, so the catalogue never
 * ends up with two identical rows. Merging is the way out. Everything that
 * points at the duplicate ("from") is moved onto the snack being kept
 * ("into"), and the duplicate is marked status 'merged' with merged_into set.
 *
 * The duplicate's row is kept rather than deleted: old links to it still work
 * (the snack page follows merged_into), and nothing that referenced it can be
 * left dangling.
 */

export interface MergeSnackRow {
  id: string;
  name: string;
  brand: string | null;
  status: string;
  merged_into: string | null;
}

export type MergeCheck = { ok: true; from: MergeSnackRow; into: MergeSnackRow } | { ok: false; error: string; status: 400 | 404 };

/** Load both snacks and say whether they can be merged. */
export async function checkMerge(db: D1Database, fromId: string, intoId: string): Promise<MergeCheck> {
  if (!fromId || !intoId) return { ok: false, error: "Pick the snack to keep.", status: 400 };
  if (fromId === intoId) return { ok: false, error: "That's the same snack.", status: 400 };
  const { results } = await db
    .prepare("SELECT id, name, brand, status, merged_into FROM snacks WHERE id IN (?1, ?2)")
    .bind(fromId, intoId)
    .all<MergeSnackRow>();
  const from = results.find((s) => s.id === fromId);
  const into = results.find((s) => s.id === intoId);
  if (!from || !into) return { ok: false, error: "Snack not found.", status: 404 };
  if (from.status === "merged") return { ok: false, error: "That snack was already merged.", status: 400 };
  if (into.status === "merged") return { ok: false, error: "The snack to keep was itself merged into another one.", status: 400 };
  if (into.status === "rejected") return { ok: false, error: "The snack to keep was rejected. Pick another one.", status: 400 };
  return { ok: true, from, into };
}

/**
 * The statements that do the merge, to run together in one db.batch (D1 runs
 * a batch as a single transaction, so it all happens or none of it does).
 *
 * Order matters for the tables keyed on (person, snack): "UPDATE OR IGNORE"
 * moves a person's row across unless they already have one on the kept snack,
 * and the DELETE after it clears the leftovers that clashed.
 */
export function mergeSnackStatements(db: D1Database, fromId: string, intoId: string): D1PreparedStatement[] {
  // Both ids for statements that use ?1 and ?2; just the duplicate's for the
  // DELETEs, which only use ?1 (D1 refuses extra bound values).
  const s = (sql: string) => db.prepare(sql).bind(fromId, intoId);
  const dupe = (sql: string) => db.prepare(sql).bind(fromId);
  return [
    // Check-ins carry everything that matters: ratings, sliders, photos,
    // likes, comments and points all hang off the check-in, so they follow it.
    s("UPDATE checkins SET snack_id = ?2 WHERE snack_id = ?1"),

    // Saved / binned suggestions: one per person per snack.
    s("UPDATE OR IGNORE explore_choices SET snack_id = ?2 WHERE snack_id = ?1"),
    dupe("DELETE FROM explore_choices WHERE snack_id = ?1"),

    // Bag-it tips: one per person per snack. A tip already paid stays paid
    // (its points live in points_ledger, which this doesn't touch).
    s("UPDATE OR IGNORE bag_tips SET snack_id = ?2 WHERE snack_id = ?1"),
    dupe("DELETE FROM bag_tips WHERE snack_id = ?1"),

    // Old Crisp of the Week tables (no longer used, kept for history).
    s("UPDATE cotw_battles SET snack_a = ?2 WHERE snack_a = ?1"),
    s("UPDATE cotw_battles SET snack_b = ?2 WHERE snack_b = ?1"),
    s("UPDATE cotw_votes SET snack_id = ?2 WHERE snack_id = ?1"),

    // Reports about the duplicate now point at the kept snack.
    s("UPDATE reports SET target_id = ?2 WHERE target_type = 'snack' AND target_id = ?1"),

    // The kept snack inherits anything it was missing: the picked main photo
    // and the vegan / gluten-free marks. If the duplicate was approved and the
    // kept one was still waiting, the kept one counts as approved too.
    s(
      `UPDATE snacks SET
         cover_photo_id  = IFNULL(cover_photo_id,  (SELECT cover_photo_id  FROM snacks WHERE id = ?1)),
         vegan           = IFNULL(vegan,           (SELECT vegan           FROM snacks WHERE id = ?1)),
         gluten_free     = IFNULL(gluten_free,     (SELECT gluten_free     FROM snacks WHERE id = ?1)),
         diet_checked_at = IFNULL(diet_checked_at, (SELECT diet_checked_at FROM snacks WHERE id = ?1)),
         status = CASE WHEN status = 'pending' AND (SELECT status FROM snacks WHERE id = ?1) = 'approved'
                       THEN 'approved' ELSE status END
       WHERE id = ?2`,
    ),

    // Finally retire the duplicate. Its own main photo moved with its
    // check-ins, so the pointer is cleared here.
    s("UPDATE snacks SET status = 'merged', merged_into = ?2, cover_photo_id = NULL WHERE id = ?1"),
  ];
}

/** Check, then merge. Returns how many check-ins moved. */
export async function mergeSnacks(db: D1Database, fromId: string, intoId: string) {
  const check = await checkMerge(db, fromId, intoId);
  if (!check.ok) return check;
  const results = await db.batch(mergeSnackStatements(db, fromId, intoId));
  const moved = Number((results[0] as { meta?: { changes?: number } })?.meta?.changes ?? 0);
  return { ok: true as const, from: check.from, into: check.into, moved };
}
