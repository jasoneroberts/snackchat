import { Hono } from "hono";
import type { StatsFeature, StatsInviter, StatsSummary } from "../../shared/types";
import { weekNumber, weekStartOf } from "../../shared/achievements";
import type { UsageFeature } from "../../shared/usage";
import type { AppContext } from "../env";
import { DEMO_PREFIX } from "../lib/demo";
import { type ActivityRow, STATS_WEEKS, type StatsUser, summarise } from "../lib/stats";
import { hasUsageTable } from "../lib/usage";

// The admin Stats page: who keeps coming back, what gets used, and where
// people came from. Mounted inside the admin routes, so only admins get here.
//
// Almost everything is worked out from tables the app already has (every
// check-in, like and vote has a time on it). Only app opens, Wing It and
// shares need their own table (app_usage, migration 0030); until that's
// applied those lines are simply left out.
export const stats = new Hono<AppContext>();

/**
 * Something people do, and where to find it: the table, whose it is, when it
 * happened, and how many times one row counts for. `active` means doing it
 * counts as "being active" that week. All of this is fixed text written here,
 * never anything from a request, so building SQL from it is safe.
 */
interface Source {
  key: string;
  label: string;
  from: string;
  who: string;
  at: string;
  times?: string;
  active?: boolean;
  usage?: boolean;
}

const usage = (feature: UsageFeature, label: string): Source => ({
  key: feature,
  label,
  from: `app_usage WHERE feature = '${feature}'`,
  who: "user_id",
  at: "day * 86400",
  times: "times",
  active: true,
  usage: true,
});

const SOURCES: Source[] = [
  usage("open", "Days people opened the app"),
  { key: "checkins", label: "Check-ins", from: "checkins", who: "user_id", at: "created_at", active: true },
  { key: "photos", label: "Photos with check-ins", from: "photos p JOIN checkins c ON c.id = p.checkin_id", who: "c.user_id", at: "p.created_at" },
  { key: "likes", label: "Likes", from: "likes", who: "user_id", at: "created_at", active: true },
  { key: "cotw", label: "Crisp of the Week votes", from: "cotw_votes", who: "user_id", at: "created_at", active: true },
  { key: "hunt", label: "Hunt: bagged or ignored", from: "explore_choices", who: "user_id", at: "created_at", active: true },
  { key: "squadJoins", label: "Joined a squad", from: "group_members", who: "user_id", at: "joined_at", active: true },
  { key: "squadsMade", label: "Started a squad", from: "groups", who: "created_by", at: "created_at" },
  { key: "snacks", label: "New snacks added", from: "snacks", who: "created_by", at: "created_at", active: true },
  { key: "badges", label: "Badges earned", from: "user_badges", who: "user_id", at: "earned_at" },
  usage("wingit", "Wing It games"),
  usage("share", "Shares"),
  { key: "reports", label: "Reports and requests", from: "reports", who: "reporter_id", at: "created_at" },
];

// Every source is read through this one shape, so each query is just
// "from this table, these three columns". A source's own WHERE (app_usage
// has one) stays inside the brackets; ours goes outside. Demo bots are left out.
const rows = (s: Source) =>
  `(SELECT ${s.who} AS who, ${s.at} AS at, ${s.times ?? 1} AS n FROM ${s.from})
     WHERE who IS NOT NULL AND who NOT LIKE '${DEMO_PREFIX}%'`;

stats.get("/", async (c) => {
  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - 7 * 86400;
  const monthAgo = now - 30 * 86400;
  const since = weekStartOf(weekNumber(now) - STATS_WEEKS + 1);

  const hasUsage = await hasUsageTable(db);
  const sources = SOURCES.filter((s) => hasUsage || !s.usage);

  const [users, checkinWeeks, inviters, push, features, activity] = await Promise.all([
    db
      .prepare(
        `SELECT u.id, u.username, u.created_at AS createdAt, u.signup_ref AS ref,
                (SELECT COUNT(*) FROM checkins c WHERE c.user_id = u.id) AS checkins
           FROM users u WHERE u.id NOT LIKE '${DEMO_PREFIX}%'`,
      )
      .all<StatsUser>(),
    // Weeks are worked out in SQL the same way as weekNumber(): days since
    // 1970, +3 because 1 Jan 1970 was a Thursday, then whole weeks.
    db
      .prepare(
        `SELECT (created_at / 86400 + 3) / 7 AS week, COUNT(*) AS n FROM checkins
          WHERE created_at >= ? AND user_id NOT LIKE '${DEMO_PREFIX}%' GROUP BY week`,
      )
      .bind(since)
      .all<{ week: number; n: number }>(),
    db
      .prepare(
        `SELECT iu.username, COUNT(*) AS joined, COUNT(r.checked_in_at) AS checkedIn
           FROM referrals r JOIN users iu ON iu.id = r.inviter_id
          GROUP BY r.inviter_id ORDER BY joined DESC, checkedIn DESC LIMIT 20`,
      )
      .all<StatsInviter>(),
    db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM push_subscriptions").first<{ n: number }>(),
    // One small query per feature, rather than one huge UNION: D1 refuses
    // more than a handful of SELECTs glued together.
    Promise.all(
      sources.map(async (s): Promise<StatsFeature> => {
        const r = await db
          .prepare(
            `SELECT IFNULL(SUM(CASE WHEN at >= ?1 THEN n END), 0) AS week,
                    COUNT(DISTINCT CASE WHEN at >= ?1 THEN who END) AS weekPeople,
                    IFNULL(SUM(n), 0) AS month,
                    COUNT(DISTINCT who) AS monthPeople
               FROM ${rows(s)} AND at >= ?2`,
          )
          .bind(weekAgo, monthAgo)
          .first<Omit<StatsFeature, "key" | "label">>();
        return { key: s.key, label: s.label, week: 0, weekPeople: 0, month: 0, monthPeople: 0, ...r };
      }),
    ),
    // Who did anything in each week. Several sources will name the same
    // person in the same week; summarise() merges them.
    Promise.all(
      sources
        .filter((s) => s.active)
        .map((s) =>
          db
            .prepare(`SELECT who AS userId, (at / 86400 + 3) / 7 AS week, MAX(at) AS last FROM ${rows(s)} AND at >= ? GROUP BY who, week`)
            .bind(since)
            .all<ActivityRow>()
            .then((r) => r.results),
        ),
    ),
  ]);

  const summary = summarise(users.results, activity.flat(), new Map(checkinWeeks.results.map((r) => [r.week, r.n])), now);
  const result: StatsSummary = {
    hasUsage,
    pushOn: push?.n ?? 0,
    features,
    inviters: inviters.results,
    ...summary,
  };
  return c.json(result);
});
