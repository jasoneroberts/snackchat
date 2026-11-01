// "Bag it" from a check-in, and the tip reward.
//
// Under someone else's check-in there's a "Bag it" button. It saves that
// snack to your bagged list (the same list as Explore's "Bag it", in
// explore_choices) and remembers whose check-in you bagged it from. When you
// later check the snack in for the first time, that person gets
// BAG_POINTS.tried points, a push, and progress towards the Tastemaker
// chieves.
//
// Guards against gaming it:
// - Only your FIRST check-in of a snack counts, and bag_tips is keyed on
//   (you, snack), so deleting and re-logging never pays twice.
// - You can't bag your own check-in, or a snack you've already tried.
// - Demo people never earn tips, and nothing is paid between people who
//   have blocked each other.
// - Each person is paid for at most BAG_POINTS.perDay tries a UTC day.
//   Tries past that still count towards the chieves, for 0 points.
// - The points go in points_ledger with no check-in (reason 'bag_tip'), so
//   they never eat into the tipper's own 100-a-day check-in cap.

import { BAG_POINTS } from "../../shared/bag";
import type { Env } from "../env";
import { checkAchievements } from "./achievements";
import { blockedEitherWay } from "./blocks";
import { pushToUser } from "./notify";

const dayStart = (time: number) => time - (time % 86400);

export type BagResult = { ok: true; snackId: string; tipper: string } | { ok: false; status: 400 | 404; error: string };

/**
 * Bag the snack in check-in `checkinId` for `userId`. If you'd already bagged
 * it from someone else, they keep the credit (first one to put you onto it).
 */
export async function bagFromCheckin(db: D1Database, userId: string, checkinId: string, time: number): Promise<BagResult> {
  // The check-in, if you can see it (same rules as the feed), plus whether you've tried the snack.
  const row = await db
    .prepare(
      `SELECT c.user_id AS ownerId, u.username AS owner, s.id AS snackId, s.status,
              EXISTS (SELECT 1 FROM checkins x WHERE x.user_id = ?1 AND x.snack_id = s.id) AS tried
         FROM checkins c JOIN users u ON u.id = c.user_id JOIN snacks s ON s.id = c.snack_id
        WHERE c.id = ?2 AND (u.is_private = 0 OR u.id = ?1) AND NOT ${blockedEitherWay("?1", "c.user_id")}`,
    )
    .bind(userId, checkinId)
    .first<{ ownerId: string; owner: string; snackId: string; status: string; tried: number }>();
  if (!row) return { ok: false, status: 404, error: "Check-in not found." };
  if (row.ownerId === userId) return { ok: false, status: 400, error: "That's your own check-in." };
  if (row.status !== "approved") return { ok: false, status: 400, error: "That snack is still waiting for approval." };
  if (row.tried) return { ok: false, status: 400, error: "You've already tried that one." };

  await db
    .prepare(
      `INSERT INTO explore_choices (user_id, snack_id, choice, created_at, from_checkin_id) VALUES (?1, ?2, 'saved', ?3, ?4)
       ON CONFLICT (user_id, snack_id) DO UPDATE SET
         choice = 'saved',
         created_at = CASE WHEN explore_choices.choice = 'saved' THEN explore_choices.created_at ELSE excluded.created_at END,
         from_checkin_id = COALESCE(explore_choices.from_checkin_id, excluded.from_checkin_id)`,
    )
    .bind(userId, row.snackId, time, checkinId)
    .run();
  return { ok: true, snackId: row.snackId, tipper: row.owner };
}

/** Un-bag the snack in check-in `checkinId` (whoever you bagged it from). */
export async function unbagFromCheckin(db: D1Database, userId: string, checkinId: string): Promise<void> {
  await db
    .prepare(
      `DELETE FROM explore_choices
        WHERE user_id = ?1 AND choice = 'saved' AND snack_id = (SELECT snack_id FROM checkins WHERE id = ?2)`,
    )
    .bind(userId, checkinId)
    .run();
}

/**
 * Statements to add to a new check-in's batch, after the check-in itself.
 * They do nothing unless this is the person's first check-in of a snack they
 * bagged from someone's check-in. The INSERT works out the points (0 once
 * the tipper is at the day's cap), then the ledger row copies them across,
 * found by this check-in's id. All in the check-in's one transaction.
 */
export function bagTipStatements(
  db: D1Database,
  opts: { userId: string; snackId: string; checkinId: string; time: number },
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `INSERT OR IGNORE INTO bag_tips (user_id, snack_id, tipper_id, from_checkin_id, checkin_id, points, created_at)
         SELECT e.user_id, e.snack_id, fc.user_id, fc.id, ?3,
                CASE WHEN (SELECT COUNT(*) FROM bag_tips t
                            WHERE t.tipper_id = fc.user_id AND t.created_at >= ?5 AND t.points > 0) < ?6
                     THEN ?7 ELSE 0 END,
                ?4
           FROM explore_choices e JOIN checkins fc ON fc.id = e.from_checkin_id
          WHERE e.user_id = ?1 AND e.snack_id = ?2 AND e.choice = 'saved'
            AND fc.user_id != ?1 AND fc.user_id NOT LIKE 'demo-%'
            AND NOT ${blockedEitherWay("?1", "fc.user_id")}
            AND NOT EXISTS (SELECT 1 FROM checkins x WHERE x.user_id = ?1 AND x.snack_id = ?2 AND x.id != ?3)`,
      )
      .bind(opts.userId, opts.snackId, opts.checkinId, opts.time, dayStart(opts.time), BAG_POINTS.perDay, BAG_POINTS.tried),
    db
      .prepare(
        `INSERT INTO points_ledger (user_id, checkin_id, reason, points, created_at)
         SELECT tipper_id, NULL, 'bag_tip', points, ?2 FROM bag_tips WHERE checkin_id = ?1 AND points > 0`,
      )
      .bind(opts.checkinId, opts.time),
  ];
}

/** The push text, in the tipper's own voice. */
export function tipMessage(voice: string | null, bagger: string, snack: string, points: number): { title: string; body: string } {
  if (voice === "lad") {
    return {
      title: points > 0 ? `+${points} pts, tastemaker` : "You've got taste",
      body: `${bagger} bagged ${snack} off your check-in and actually had one.`,
    };
  }
  return {
    title: points > 0 ? `+${points} pts` : "You inspired a check-in",
    body: `${bagger} tried ${snack} after bagging it from your check-in.`,
  };
}

/**
 * After a check-in: if it just earned someone a tip, give them any new
 * chieve and tell them. Never throws: this mustn't break the check-in.
 */
export async function tellTipper(env: Env, origin: string, opts: { checkinId: string; baggerName: string }): Promise<void> {
  try {
    const row = await env.DB.prepare(
      `SELECT t.tipper_id, t.points, u.voice, s.name AS snack
         FROM bag_tips t JOIN users u ON u.id = t.tipper_id JOIN snacks s ON s.id = t.snack_id
        WHERE t.checkin_id = ?`,
    )
      .bind(opts.checkinId)
      .first<{ tipper_id: string; points: number; voice: string | null; snack: string }>();
    if (!row) return;
    // Hand out the Tastemaker chieves now, so they're dated right; the app's
    // new-chieve popup shows them next time the tipper opens it.
    await checkAchievements(env.DB, row.tipper_id).catch((err) => console.error("[bag] badges failed", err));
    await pushToUser(env, origin, row.tipper_id, { kind: "tip", url: "/me", ...tipMessage(row.voice, opts.baggerName, row.snack, row.points) });
  } catch (err) {
    console.error("[bag] tellTipper failed", err);
  }
}

/** For the check-in screen: who you just earned a tip for, if anyone. */
export async function tipFor(db: D1Database, checkinId: string): Promise<{ username: string; points: number } | null> {
  try {
    return await db
      .prepare("SELECT u.username, t.points FROM bag_tips t JOIN users u ON u.id = t.tipper_id WHERE t.checkin_id = ?")
      .bind(checkinId)
      .first<{ username: string; points: number }>();
  } catch (err) {
    console.error("[bag] tipFor failed", err);
    return null;
  }
}
