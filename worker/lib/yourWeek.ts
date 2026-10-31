// "Your week": the card at the top of the feed on Mondays that sums up what
// happened for you last week, instead of a round-up push:
//
//   Your week
//   ❤️ 8 likes from Sam, Dave and 3 others
//   🍟 You logged 5 snacks
//   👥 Your squads logged 12 snacks. Best: Sam's Wotsits, 5★
//
// Nothing is stored for it. Likes and check-ins already carry their times, so
// we count what landed between last Monday 00:00 UTC and this Monday 00:00 UTC
// whenever the card asks.
//
// The same rules as everywhere else: blocked people never count, a private
// person's check-ins don't count towards your squads (the squad feed hides
// them too), demo bots never count, and your own hearts don't count.

import type { YourWeek } from "../../shared/types";
import { blockedEitherWay } from "./blocks";
import { periodStart } from "./groups";

const WEEK = 7 * 86400;

/** Last week's start and end (Monday 00:00 UTC each), for a time in this week. */
export function lastWeek(nowSeconds: number): { since: number; until: number } {
  const until = periodStart("weekly", nowSeconds);
  return { since: until - WEEK, until };
}

/** What happened for `userId` from `since` (inclusive) to `until` (not inclusive), in seconds. */
export async function yourWeek(db: D1Database, userId: string, since: number, until: number): Promise<YourWeek> {
  // ?1 = you. One row per person who hearted any of your check-ins, with how
  // many hearts they gave, busiest first.
  const { results: likers } = await db
    .prepare(
      `SELECT l.username AS name, COUNT(*) AS n
         FROM likes k
         JOIN checkins c ON c.id = k.checkin_id
         JOIN users l ON l.id = k.user_id
        WHERE c.user_id = ?1 AND k.user_id != ?1 AND l.id NOT LIKE 'demo-%'
          AND k.created_at >= ?2 AND k.created_at < ?3
          AND NOT ${blockedEitherWay("?1", "k.user_id")}
        GROUP BY l.id
        ORDER BY n DESC, l.username`,
    )
    .bind(userId, since, until)
    .all<{ name: string; n: number }>();

  const checkins =
    (await db
      .prepare("SELECT COUNT(*) AS n FROM checkins WHERE user_id = ?1 AND created_at >= ?2 AND created_at < ?3")
      .bind(userId, since, until)
      .first<number>("n")) ?? 0;

  // Check-ins by anyone sharing a squad with you. The squad join sits inside
  // EXISTS so someone in two of your squads isn't counted twice.
  const squadCheckins = `
    FROM checkins c
    JOIN users p ON p.id = c.user_id
    JOIN snacks s ON s.id = c.snack_id
   WHERE c.user_id != ?1 AND p.is_private = 0 AND p.id NOT LIKE 'demo-%'
     AND c.created_at >= ?2 AND c.created_at < ?3
     AND EXISTS (SELECT 1 FROM group_members mine JOIN group_members theirs ON theirs.group_id = mine.group_id
                  WHERE mine.user_id = ?1 AND theirs.user_id = c.user_id)
     AND NOT ${blockedEitherWay("?1", "c.user_id")}`;
  const squadCount = (await db.prepare(`SELECT COUNT(*) AS n ${squadCheckins}`).bind(userId, since, until).first<number>("n")) ?? 0;
  const best = squadCount
    ? await db
        .prepare(
          `SELECT p.username AS poster, s.name AS snack, s.id AS snackId, c.overall ${squadCheckins}
            ORDER BY c.overall DESC, c.created_at DESC LIMIT 1`,
        )
        .bind(userId, since, until)
        .first<YourWeek["best"]>()
    : null;

  return {
    likes: likers.reduce((sum, r) => sum + r.n, 0),
    likers: likers.slice(0, 2).map((r) => r.name),
    likerCount: likers.length,
    checkins,
    squadCheckins: squadCount,
    best: best ?? null,
  };
}
