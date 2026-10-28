import { Hono } from "hono";
import { dietSql, readDiets } from "../../shared/diet";
import { filterTypes } from "../../shared/typeFilters";
import type { BoardPeriod, PeopleMetric, PeopleRow, SnackRow } from "../../shared/types";
import type { AppContext } from "../env";
import { BOARD_PERIODS, boardScore, boardStart } from "../lib/boards";
import { currentUser } from "../lib/currentUser";
import { rank } from "../lib/groups";
import { LATEST_PHOTO } from "../lib/photoSql";

export const boards = new Hono<AppContext>();

const now = () => Math.floor(Date.now() / 1000);
const TOP = 50;
const METRICS: PeopleMetric[] = ["points", "checkins", "snacks"];

/**
 * Who a board covers. "global" is everyone with a public profile (plus you);
 * a group id is that group's members, counting only its snack types.
 * Returns null when you aren't in the group.
 */
async function resolveScope(c: { env: AppContext["Bindings"] }, scope: string, userId: string) {
  if (scope === "global") return { groupId: null as string | null, categories: null as string | null };
  const g = await c.env.DB.prepare(
    `SELECT g.id, g.categories FROM groups g JOIN group_members m ON m.group_id = g.id
      WHERE g.id = ? AND m.user_id = ?`,
  )
    .bind(scope, userId)
    .first<{ id: string; categories: string | null }>();
  return g ? { groupId: g.id, categories: g.categories } : null;
}

function readPeriod(value: string | undefined): BoardPeriod {
  return BOARD_PERIODS.includes(value as BoardPeriod) ? (value as BoardPeriod) : "week";
}

// Bind order shared by both boards: ?1 you, ?2 period start, ?3 group id or
// NULL, ?4 the group's snack types as JSON or NULL.
const WHO = `(CASE WHEN ?3 IS NULL THEN (u.is_private = 0 OR u.id = ?1)
                   ELSE u.id IN (SELECT user_id FROM group_members WHERE group_id = ?3) END)`;
const TYPES = `(?4 IS NULL OR s.category_id IN (SELECT value FROM json_each(?4)))`;

// People ranked by points, check-ins or different snacks.
boards.get("/people", async (c) => {
  const user = currentUser(c);
  const scope = await resolveScope(c, c.req.query("scope") ?? "global", user.id);
  if (!scope) return c.json({ error: "Group not found." }, 404);
  const metric = METRICS.includes(c.req.query("metric") as PeopleMetric)
    ? (c.req.query("metric") as PeopleMetric)
    : "points";

  const { results } = await c.env.DB.prepare(
    `SELECT u.username, u.avatar_id AS avatarId,
            (SELECT COALESCE(SUM(pl.points), 0) FROM points_ledger pl
               JOIN checkins c ON c.id = pl.checkin_id JOIN snacks s ON s.id = c.snack_id
              WHERE pl.user_id = u.id AND pl.created_at >= ?2 AND ${TYPES}) AS points,
            (SELECT COUNT(*) FROM checkins c JOIN snacks s ON s.id = c.snack_id
              WHERE c.user_id = u.id AND c.created_at >= ?2 AND ${TYPES}) AS checkins,
            (SELECT COUNT(DISTINCT c.snack_id) FROM checkins c JOIN snacks s ON s.id = c.snack_id
              WHERE c.user_id = u.id AND c.created_at >= ?2 AND ${TYPES}) AS snacks
       FROM users u
      WHERE ${WHO}`,
  )
    .bind(user.id, boardStart(readPeriod(c.req.query("period")), now()), scope.groupId, scope.categories)
    .all<Omit<PeopleRow, "value" | "rank">>();

  // Leave out people with nothing this period, except you (so you can see where you stand).
  const active = results.filter((r) => r.checkins > 0 || r.username === user.username);
  const ranked = rank(active.map((r) => ({ ...r, value: r[metric] })));
  const top = ranked.slice(0, TOP);
  const me = ranked.find((r) => r.username === user.username);
  if (me && !top.includes(me)) top.push(me);
  return c.json({ rows: top satisfies PeopleRow[] });
});

// Snacks ranked by rating, optionally for one snack type (or lad mode's "rest"). Only approved
// snacks appear. Every snack rated in the period counts; the order uses a weighted
// average, with a stand-in 2.5 for snacks rated only once (lib/boards.ts).
boards.get("/snacks", async (c) => {
  const user = currentUser(c);
  const scope = await resolveScope(c, c.req.query("scope") ?? "global", user.id);
  if (!scope) return c.json({ error: "Group not found." }, 404);
  const types = filterTypes(c.req.query("category"));
  const diets = readDiets(c.req.query("diet"));
  const period = readPeriod(c.req.query("period"));

  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.name, s.brand, s.category_id AS category, s.status,
            AVG(c.overall) AS avg, COUNT(*) AS count, (${LATEST_PHOTO}) AS photoId
       FROM checkins c
       JOIN snacks s ON s.id = c.snack_id
       JOIN users u ON u.id = c.user_id
      WHERE c.created_at >= ?2 AND s.status = 'approved' AND ${WHO} AND ${TYPES}
        AND (?5 IS NULL OR s.category_id IN (SELECT value FROM json_each(?5)))${dietSql(diets)}
      GROUP BY s.id`,
  )
    .bind(user.id, boardStart(period, now()), scope.groupId, scope.categories, types && JSON.stringify(types))
    .all<{ id: string; name: string; brand: string | null; category: string; status: string; avg: number; count: number; photoId: string | null }>();

  const total = results.reduce((n, r) => n + r.count, 0);
  const mean = total ? results.reduce((sum, r) => sum + r.avg * r.count, 0) / total : 0;
  const scored = results
    .map((r) => ({ r, score: boardScore(r.avg, r.count, mean) }))
    .sort((a, b) => b.score - a.score || b.r.count - a.r.count || a.r.name.localeCompare(b.r.name))
    .slice(0, TOP);

  const rows: SnackRow[] = scored.map(({ r }, i) => ({
    snack: { id: r.id, name: r.name, brand: r.brand, category: r.category, status: r.status, photoId: r.photoId },
    avg: r.avg,
    count: r.count,
    rank: i + 1,
  }));
  return c.json({ rows });
});
