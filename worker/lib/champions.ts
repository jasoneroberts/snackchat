// Last week's champions, for the card at the top of the feed on Mondays:
// the snack that finished top of the Table's "This week", and the person
// with the most points. Both are worked out the same way the Table works
// them out (worker/routes/boards.ts), just for the week that's finished, so
// the card always agrees with what the Table showed on Sunday night.
//
// The same winners wear crowns around the app (crowns() below), along with
// each squad's champion and last month's top snack.

import type { Champions, Crowns } from "../../shared/achievements";
import type { Env } from "../env";
import type { ScoringMode } from "../../shared/types";
import { champions, lastWeek } from "./groups";
import { squadScores } from "./squadScores";
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
                (SELECT MAX(c.created_at) FROM checkins c
                  WHERE c.user_id = u.id AND c.created_at >= ?1 AND c.created_at < ?2 AND c.scored = 1) AS lastAt,
                (SELECT COALESCE(SUM(pl.points), 0) FROM points_ledger pl JOIN checkins c ON c.id = pl.checkin_id
                  WHERE pl.user_id = u.id AND pl.created_at >= ?1 AND pl.created_at < ?2 AND c.scored = 1)
                ${invitePointsSql("u.id", "?1")} - (0${invitePointsSql("u.id", "?2")}) AS points
           FROM users u
          WHERE u.is_private = 0 AND u.is_admin = 0 AND u.id NOT LIKE 'demo-%')
        WHERE points > 0
        ORDER BY points DESC, lastAt, username
        LIMIT 1`,
    )
    .bind(start, end)
    .all<{ username: string; avatarId: string | null; points: number }>();

  return { weekStart: start, snack, person: people[0] ?? null };
}

/**
 * Last calendar month's top snack, ranked as the Table ranks "This month"
 * (a lone rating gets the 2.5 stand-in, so one 5 can't win it).
 */
export async function lastMonthsTopSnack(db: D1Database, nowSeconds: number): Promise<string | null> {
  const end = periodStart("monthly", nowSeconds);
  const d = new Date(end * 1000);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1) / 1000;
  const { results } = await db
    .prepare(
      `SELECT s.id, s.name, AVG(c.overall) AS avg, COUNT(*) AS count
         FROM checkins c JOIN snacks s ON s.id = c.snack_id JOIN users u ON u.id = c.user_id
        WHERE c.created_at >= ?1 AND c.created_at < ?2 AND c.scored = 1 AND s.status = 'approved' AND u.is_private = 0
        GROUP BY s.id`,
    )
    .bind(start, end)
    .all<{ id: string; name: string; avg: number; count: number }>();
  const top = results
    .map((r) => ({ ...r, avg: boardAverage("month", r.avg, r.count).avg }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count || a.name.localeCompare(b.name))[0];
  return top?.id ?? null;
}

// A squad's champion only wears the crown around the app (feed, Table,
// profile) when at least this many members scored that week, so a squad of
// one can't hand someone a permanent crown. Inside the squad it always shows.
export const MIN_SQUAD_SCORERS = 3;

/**
 * Everyone and everything wearing a crown this week: last week's global
 * points winner, each busy squad's champion, last week's top snack and last
 * month's top snack.
 */
export async function crowns(db: D1Database, nowSeconds: number): Promise<Crowns> {
  const { start, end } = lastWeek(nowSeconds);
  const [week, monthSnack, { results: squads }] = await Promise.all([
    lastWeeksChampions(db, nowSeconds),
    lastMonthsTopSnack(db, nowSeconds),
    db.prepare("SELECT id, scoring_mode, categories FROM groups").all<{ id: string; scoring_mode: ScoringMode; categories: string | null }>(),
  ]);

  const people: Crowns["people"] = {};
  const boards = await Promise.all(squads.map((g) => squadScores(db, g, start, end)));
  for (const rows of boards) {
    if (rows.filter((r) => r.value > 0).length < MIN_SQUAD_SCORERS) continue;
    for (const r of champions(rows)) people[r.username] = "squad";
  }
  // The global winner's crown says so, even if they also won a squad.
  if (week.person) people[week.person.username] = "global";

  const snacks: Crowns["snacks"] = {};
  if (week.snack) snacks[week.snack.id] = ["week"];
  if (monthSnack) snacks[monthSnack] = [...(snacks[monthSnack] ?? []), "month"];
  return { people, snacks };
}

/** crowns(), kept for an hour: the weeks it looks at are finished, so it rarely changes. */
export async function cachedCrowns(env: Env, nowSeconds: number): Promise<Crowns> {
  const key = `crowns:v1:${lastWeek(nowSeconds).start}:${periodStart("monthly", nowSeconds)}`;
  const hit = await env.CACHE.get<Crowns>(key, "json").catch(() => null);
  if (hit) return hit;
  const fresh = await crowns(env.DB, nowSeconds);
  await env.CACHE.put(key, JSON.stringify(fresh), { expirationTtl: 3600 }).catch(() => undefined);
  return fresh;
}
