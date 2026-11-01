// Badges and weekly streaks.
//
// Nothing here is counted up as it happens. Instead, whenever it matters
// (after a check-in, or when a profile is opened) we work out every
// badge's number from what's already in the database, and any badge whose
// number has reached its goal is written to user_badges. That means badges
// can't drift out of step, existing users get the badges they've already
// earned the first time they look, and a new badge added to
// shared/achievements.ts is handed out to everyone who qualifies with no
// migration. The badge list itself lives in shared/achievements.ts.

import {
  BADGES,
  SECRET_BADGES,
  WINGIT_BADGES,
  badgeById,
  isEarly,
  isLate,
  streakFrom,
  weekNumber,
  type AchievementsPage,
  type BadgeDef,
  type BadgeState,
  type Metric,
  type Streak,
} from "../../shared/achievements";
import { REVIEW_BONUS_CHARS } from "../../shared/catalogue";
import type { Env } from "../env";
import { periodStart } from "./groups";
import { pushToUser } from "./notify";

const SCAMPI_FRIES = "seed-scampi-fries";
/** The metrics worked out from the database. "secret" and "wingit" badges are handed out by the game instead. */
type Counted = Exclude<Metric, "secret" | "wingit">;
const DAY = 86400;

/** Every badge's number for one person, plus their streak. */
export async function progressFor(db: D1Database, userId: string, nowSeconds: number): Promise<{ counts: Record<Counted, number>; streak: Streak }> {
  // One trip to the database for all the simple counts. Only check-ins that
  // count (scored = 1) count here too, as on the boards.
  const distinctOf = (category: string) =>
    `(SELECT COUNT(DISTINCT c.snack_id) FROM checkins c JOIN snacks s ON s.id = c.snack_id
       WHERE c.user_id = ?1 AND c.scored = 1 AND s.category_id = '${category}')`;
  const counts = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM checkins WHERE user_id = ?1 AND scored = 1) AS checkins,
         (SELECT COUNT(DISTINCT snack_id) FROM checkins WHERE user_id = ?1 AND scored = 1) AS snacks,
         ${distinctOf("crisps")} AS crisps,
         ${distinctOf("chocolate")} AS sweets,
         ${distinctOf("world")} AS world,
         (SELECT COUNT(DISTINCT s.category_id) FROM checkins c JOIN snacks s ON s.id = c.snack_id
           WHERE c.user_id = ?1 AND c.scored = 1) AS types,
         (SELECT COUNT(*) FROM checkins WHERE user_id = ?1 AND scored = 1 AND LENGTH(TRIM(review)) >= ${REVIEW_BONUS_CHARS}) AS reviews,
         (SELECT COUNT(*) FROM photos p JOIN checkins c ON c.id = p.checkin_id WHERE c.user_id = ?1 AND p.status = 'visible') AS photos,
         (SELECT COUNT(*) FROM likes l JOIN checkins c ON c.id = l.checkin_id WHERE c.user_id = ?1 AND l.user_id != ?1) AS hearts,
         (SELECT COUNT(*) FROM group_members WHERE user_id = ?1) AS squads,
         (SELECT COUNT(*) FROM referrals WHERE inviter_id = ?1) AS invites,
         (SELECT COUNT(*) FROM checkins WHERE user_id = ?1 AND scored = 1 AND snack_id = '${SCAMPI_FRIES}' AND overall <= 2) AS scampi_low,
         (SELECT COUNT(*) FROM checkins WHERE user_id = ?1 AND scored = 1 AND snack_id = '${SCAMPI_FRIES}' AND overall >= 4.5) AS scampi_high`,
    )
    .bind(userId)
    .first<Record<string, number>>();

  // The time of every check-in, for Night Owl, Breakfast of Champions and the
  // streak. Done in code because "what hour was it in the UK" needs to know
  // about summer time, which SQLite doesn't.
  const { results: times } = await db
    .prepare("SELECT created_at FROM checkins WHERE user_id = ? AND scored = 1")
    .bind(userId)
    .all<{ created_at: number }>();
  const streak = streakFrom(
    times.map((t) => weekNumber(t.created_at)),
    nowSeconds,
  );

  return {
    counts: {
      ...(counts as Record<Exclude<Counted, "late" | "early" | "streak">, number>),
      late: times.filter((t) => isLate(t.created_at)).length,
      early: times.filter((t) => isEarly(t.created_at)).length,
      streak: streak.best,
    },
    streak,
  };
}


/** Write badges to someone's name. INSERT OR IGNORE, so giving one twice does nothing. */
function awardStatements(db: D1Database, userId: string, badges: BadgeDef[], nowSeconds: number): D1PreparedStatement[] {
  return badges.flatMap((b) => [
    // The badges table needs a row for each badge before anyone can hold it.
    db.prepare("INSERT OR IGNORE INTO badges (id, name, description, points) VALUES (?, ?, ?, 0)").bind(b.id, b.name, b.description),
    db.prepare("INSERT OR IGNORE INTO user_badges (user_id, badge_id, earned_at) VALUES (?, ?, ?)").bind(userId, b.id, nowSeconds),
  ]);
}

const toState = (b: BadgeDef, progress: number | null, earnedAt: number | null): BadgeState => ({
  id: b.id,
  name: b.name,
  emoji: b.emoji,
  description: b.description,
  goal: b.goal,
  progress,
  earnedAt,
});

/**
 * Work out someone's badges and streak, and hand out any badges they've just
 * reached. `newly` lists those, so the check-in screen can say "New badge!".
 * Hidden badges only appear once earned.
 */
export async function checkAchievements(
  db: D1Database,
  userId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ page: AchievementsPage; newly: BadgeState[] }> {
  const [{ counts, streak }, held] = await Promise.all([
    progressFor(db, userId, nowSeconds),
    db.prepare("SELECT badge_id, earned_at FROM user_badges WHERE user_id = ?").bind(userId).all<{ badge_id: string; earned_at: number }>(),
  ]);
  const earned = new Map(held.results.map((r) => [r.badge_id, r.earned_at]));

  const reached = BADGES.filter((b) => !earned.has(b.id) && b.metric in counts && counts[b.metric as Counted] >= b.goal);
  if (reached.length) {
    await db.batch(awardStatements(db, userId, reached, nowSeconds));
    for (const b of reached) earned.set(b.id, nowSeconds);
  }

  const badges = BADGES.filter((b) => !b.hidden || earned.has(b.id)).map((b) =>
    toState(b, b.metric in counts ? Math.min(counts[b.metric as Counted], b.goal) : null, earned.get(b.id) ?? null),
  );
  return { page: { streak, badges }, newly: badges.filter((b) => reached.some((r) => r.id === b.id)) };
}

/**
 * Give a secret badge (one a hidden game hands out). Only badges listed in
 * SECRET_BADGES can be given this way. Returns null for any other id.
 */
export async function awardSecretBadge(
  db: D1Database,
  userId: string,
  badgeId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ badge: BadgeState; new: boolean } | null> {
  const def = badgeById(badgeId);
  if (!def || !SECRET_BADGES.has(def.id)) return null;
  const results = await db.batch(awardStatements(db, userId, [def], nowSeconds));
  const isNew = (results[1]?.meta?.changes ?? 0) > 0;
  const row = await db
    .prepare("SELECT earned_at FROM user_badges WHERE user_id = ? AND badge_id = ?")
    .bind(userId, def.id)
    .first<{ earned_at: number }>();
  return { badge: toState(def, null, row?.earned_at ?? nowSeconds), new: isNew };
}

/**
 * A Wing It round has ended: give every score badge the score reaches. The
 * game sends its best score on this phone, so people who played before
 * these badges existed get theirs too. Returns the ones that are new.
 * Scores aren't kept: the badges are the record.
 */
export async function awardWingItBadges(
  db: D1Database,
  userId: string,
  score: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<BadgeState[]> {
  const reached = WINGIT_BADGES.filter((b) => score >= b.goal);
  if (!reached.length) return [];
  const results = await db.batch(awardStatements(db, userId, reached, nowSeconds));
  // Every badge is two statements; the second (into user_badges) says if it's new.
  return reached.filter((_, i) => (results[i * 2 + 1]?.meta?.changes ?? 0) > 0).map((b) => toState(b, null, nowSeconds));
}

/**
 * Wrapped in a try for routes: a badge going wrong must never stop a
 * check-in from saving. Returns the badges just earned, if any.
 */
export async function newBadgesSafely(db: D1Database, userId: string, nowSeconds?: number): Promise<BadgeState[]> {
  try {
    return (await checkAchievements(db, userId, nowSeconds)).newly;
  } catch (err) {
    console.error("[badges] check failed", err);
    return [];
  }
}

// Streak nudges --------------------------------------------------------------

/** The push text for a streak about to end, in the person's voice. */
export function streakMessage(voice: string | null, weeks: number): { title: string; body: string } {
  if (voice === "lad") {
    return { title: "Don't bottle it now", body: `${weeks} weeks on the bounce. Log a snack before midnight or the streak's gone.` };
  }
  return {
    title: `Keep your ${weeks}-week streak going`,
    body: `You've checked in ${weeks} weeks in a row. Log a snack before midnight to make it ${weeks + 1}.`,
  };
}

/**
 * Sunday evening (the 18:00 UTC cron): everyone with a streak of 2 weeks or
 * more who hasn't checked in yet this week gets one push. They're the people
 * with check-in reminders on and a phone signed up, as for reminders. Returns
 * who was nudged, so the ordinary "you've gone quiet" reminder can skip them
 * in the same run instead of sending a second push.
 */
export async function sendStreakNudges(env: Env, origin: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<Set<string>> {
  const thisWeek = periodStart("weekly", nowSeconds);
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.voice FROM users u
      WHERE u.reminders = 1 AND u.id NOT LIKE 'demo-%'
        AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)
        AND EXISTS (SELECT 1 FROM checkins c WHERE c.user_id = u.id AND c.scored = 1 AND c.created_at >= ?1 - 7 * ${DAY} AND c.created_at < ?1)
        AND NOT EXISTS (SELECT 1 FROM checkins c WHERE c.user_id = u.id AND c.scored = 1 AND c.created_at >= ?1)`,
  )
    .bind(thisWeek)
    .all<{ id: string; voice: string | null }>();

  const nudged = new Set<string>();
  for (const u of results) {
    const { results: times } = await env.DB.prepare("SELECT created_at FROM checkins WHERE user_id = ? AND scored = 1")
      .bind(u.id)
      .all<{ created_at: number }>();
    const streak = streakFrom(
      times.map((t) => weekNumber(t.created_at)),
      nowSeconds,
    );
    if (streak.current < 2) continue;
    await pushToUser(env, origin, u.id, { kind: "streak", url: "/checkin", ...streakMessage(u.voice, streak.current) });
    nudged.add(u.id);
  }
  return nudged;
}
