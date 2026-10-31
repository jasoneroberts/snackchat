// Last week's champions, for the card at the top of the feed on Mondays:
// the snack that finished top of the Table's "This week", and the person
// with the most points. Both are worked out the same way the Table works
// them out (worker/routes/boards.ts), just for the week that's finished, so
// the card always agrees with what the Table showed on Sunday night.

import type { Champions } from "../../shared/achievements";
import { boardAverage } from "./boards";
import { periodStart } from "./groups";
import { invitePointsSql } from "./referrals";
import { LATEST_PHOTO } from "./photoSql";

const WEEK = 7 * 86400;

export async function lastWeeksChampions(db: D1Database, nowSeconds: number): Promise<Champions> {
  const end = periodStart("weekly", nowSeconds);
  const start = end - WEEK;

  // Snacks: approved, rated last week by people with public profiles, ranked
  // by the week's real average (a lone 5 is a 5 on "This week"), then by how
  // many rated it, then by name, exactly as the Table does.
  const { results: snacks } = await db
    .prepare(
      `SELECT s.id, s.name, s.brand, s.category_id AS category, AVG(c.overall) AS avg, COUNT(*) AS count,
              (${LATEST_PHOTO}) AS photoId
         FROM checkins c JOIN snacks s ON s.id = c.snack_id JOIN users u ON u.id = c.user_id
        WHERE c.created_at >= ?1 AND c.created_at < ?2 AND c.scored = 1 AND s.status = 'approved' AND u.is_private = 0
        GROUP BY s.id`,
    )
    .bind(start, end)
    .all<{ id: string; name: string; brand: string | null; category: string; avg: number; count: number; photoId: string | null }>();
  const snack =
    snacks
      .map((r) => ({ ...r, avg: boardAverage("week", r.avg, r.count).avg }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count || a.name.localeCompare(b.name))[0] ?? null;

  // People: points earned last week, as on the global people Table (public
  // profiles, admins left out, invite points counted while they count there).
  // invitePointsSql adds points from its start time on, so take away
  // whatever came after the week ended.
  const { results: people } = await db
    .prepare(
      `SELECT username, avatarId, points FROM (
         SELECT u.username, u.avatar_id AS avatarId,
                (SELECT COALESCE(SUM(pl.points), 0) FROM points_ledger pl JOIN checkins c ON c.id = pl.checkin_id
                  WHERE pl.user_id = u.id AND pl.created_at >= ?1 AND pl.created_at < ?2 AND c.scored = 1)
                ${invitePointsSql("u.id", "?1")} - (0${invitePointsSql("u.id", "?2")}) AS points
           FROM users u
          WHERE u.is_private = 0 AND u.is_admin = 0 AND u.id NOT LIKE 'demo-%')
        WHERE points > 0
        ORDER BY points DESC, username
        LIMIT 1`,
    )
    .bind(start, end)
    .all<{ username: string; avatarId: string | null; points: number }>();

  return { weekStart: start, snack, person: people[0] ?? null };
}
