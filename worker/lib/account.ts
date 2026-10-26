// Deleting an account, and downloading everything Crunchd holds about
// someone. Both are rights under UK GDPR; the Privacy page explains them.

import type { Env } from "../env";
import { DEMO_PHOTO_PREFIX } from "./demo";

/**
 * Delete someone and everything that's theirs: check-ins, ratings, reviews,
 * photos, points, group memberships, follows, blocks, reports they made. Most
 * of that goes by itself (ON DELETE CASCADE); the rest is handled here:
 * - snacks they added stay, without their name on them,
 * - groups they started pass to the longest-standing member, or go if empty,
 * - their photo and profile picture files are removed from R2.
 */
export async function deleteAccount(env: Env, userId: string): Promise<void> {
  const db = env.DB;

  // Photo files to remove afterwards. (Demo people share demo files, so skip those.)
  const photos = await db
    .prepare(
      `SELECT p.id, p.r2_key FROM photos p JOIN checkins c ON c.id = p.checkin_id
        WHERE c.user_id = ?`,
    )
    .bind(userId)
    .all<{ id: string; r2_key: string }>();

  const owned = await db.prepare("SELECT id FROM groups WHERE created_by = ?").bind(userId).all<{ id: string }>();
  const handover: D1PreparedStatement[] = [];
  for (const { id } of owned.results) {
    const heir = await db
      .prepare(
        `SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ?
          ORDER BY role = 'admin' DESC, joined_at LIMIT 1`,
      )
      .bind(id, userId)
      .first<{ user_id: string }>();
    if (heir) {
      handover.push(
        db.prepare("UPDATE groups SET created_by = ? WHERE id = ?").bind(heir.user_id, id),
        db.prepare("UPDATE group_members SET role = 'owner' WHERE group_id = ? AND user_id = ?").bind(id, heir.user_id),
      );
    } else {
      handover.push(db.prepare("DELETE FROM groups WHERE id = ?").bind(id));
    }
  }

  // One batch, so it all happens or none of it does.
  await db.batch([
    ...handover,
    db.prepare("UPDATE snacks SET created_by = NULL WHERE created_by = ?").bind(userId),
    db.prepare("UPDATE invite_codes SET created_by = NULL WHERE created_by = ?").bind(userId),
    db
      .prepare(
        `UPDATE snacks SET cover_photo_id = NULL WHERE cover_photo_id IN
           (SELECT p.id FROM photos p JOIN checkins c ON c.id = p.checkin_id WHERE c.user_id = ?)`,
      )
      .bind(userId),
    // Reports about them or their check-ins are settled: there's nothing left to look at.
    db
      .prepare(
        `UPDATE reports SET resolved = 1, resolved_at = unixepoch(), outcome = 'account deleted'
          WHERE resolved = 0 AND ((target_type = 'user' AND target_id = ?1)
             OR (target_type = 'checkin' AND target_id IN (SELECT id FROM checkins WHERE user_id = ?1)))`,
      )
      .bind(userId),
    db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);

  // Files last: if this fails the account is still gone, and the files can't be reached.
  const keys = photos.results.map((p) => p.r2_key).filter((k) => !k.startsWith(DEMO_PHOTO_PREFIX));
  let cursor: string | undefined;
  do {
    const list = await env.PHOTOS.list({ prefix: `avatars/${userId}/`, cursor });
    keys.push(...list.objects.map((o) => o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  for (let i = 0; i < keys.length; i += 1000) await env.PHOTOS.delete(keys.slice(i, i + 1000));
}

/**
 * Everything about one person, as one JSON-ready object. Their PIN or
 * password is left out (it's only stored scrambled anyway).
 */
export async function exportAccount(db: D1Database, userId: string, origin: string) {
  const all = <T = Record<string, unknown>>(sql: string) =>
    db
      .prepare(sql)
      .bind(userId)
      .all<T>()
      .then((r) => r.results);

  const [account] = await all(
    `SELECT id, username, CASE WHEN email LIKE '%.invalid' THEN NULL ELSE email END AS email, email_verified, country,
            is_private, voice, created_at FROM users WHERE id = ?`,
  );
  const [checkins, attributes, photos, points, groups, follows, tastes, explore, badges, snacks, reports, blocks] = await Promise.all([
    all(
      `SELECT c.id, s.name AS snack, s.brand, c.overall, c.review, c.venue_text AS venue, c.paired_with, c.created_at
         FROM checkins c JOIN snacks s ON s.id = c.snack_id WHERE c.user_id = ? ORDER BY c.created_at`,
    ),
    all<{ checkin_id: string; attribute: string; value: number }>(
      "SELECT a.checkin_id, a.attribute, a.value FROM checkin_attributes a JOIN checkins c ON c.id = a.checkin_id WHERE c.user_id = ?",
    ),
    all<{ id: string; checkin_id: string; status: string; created_at: number }>(
      "SELECT p.id, p.checkin_id, p.status, p.created_at FROM photos p JOIN checkins c ON c.id = p.checkin_id WHERE c.user_id = ?",
    ),
    all("SELECT checkin_id, reason, points, created_at FROM points_ledger WHERE user_id = ? ORDER BY created_at"),
    all("SELECT g.name, m.role, m.joined_at FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ?"),
    all(
      `SELECT u.username, f.created_at FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ?`,
    ),
    all("SELECT category_id AS snack_type, attribute, value FROM taste_by_type WHERE user_id = ?"),
    all("SELECT s.name AS snack, e.choice, e.created_at FROM explore_choices e JOIN snacks s ON s.id = e.snack_id WHERE e.user_id = ?"),
    all("SELECT badge_id, earned_at FROM user_badges WHERE user_id = ?"),
    all("SELECT name, brand, category_id AS snack_type, status, created_at FROM snacks WHERE created_by = ?"),
    all("SELECT target_type, reason, note, resolved, created_at FROM reports WHERE reporter_id = ?"),
    all("SELECT u.username, b.created_at FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ?"),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    note: "Everything Crunchd holds about you. Times are Unix seconds. Photo links work while you're signed in.",
    account,
    checkins: checkins.map((c) => ({
      ...c,
      sliders: Object.fromEntries(attributes.filter((a) => a.checkin_id === c.id).map((a) => [a.attribute, a.value])),
      photos: photos.filter((p) => p.checkin_id === c.id).map((p) => ({ status: p.status, url: `${origin}/api/photos/${p.id}` })),
    })),
    points,
    groups,
    following: follows,
    tastePreferences: tastes,
    exploreChoices: explore,
    badges,
    snacksAdded: snacks,
    reportsMade: reports,
    blocked: blocks,
  };
}
