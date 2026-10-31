// Crisp of the Week: two snacks head to head, one vote each, a new pair
// every Monday. Results go to everyone who voted on Monday evening.
//
// There's no job that picks the pair. The first person to open Crisp of
// the Week in a new week causes it to be picked (ensureBattle), and
// INSERT OR IGNORE on the week means two people arriving at once still end
// up with the same pair.

import { percentages, type Battle, type BattleSnack } from "../../shared/achievements";
import type { Env } from "../env";
import { periodStart } from "./groups";
import { pushToUser } from "./notify";
import { LATEST_PHOTO } from "./photoSql";

const DAY = 86400;
const WEEK = 7 * DAY;
/** A snack sits out this many weeks after a battle before it can be picked again. */
export const REST_WEEKS = 6;
/** Pairs are drawn from this many of the most checked-in snacks of a type, so the battles are snacks people know. */
export const POOL_SIZE = 12;

interface BattleRow {
  week_start: number;
  snack_a: string;
  snack_b: string;
}

/**
 * Choose two snacks for a week. Crisps when there are enough of them (it's
 * Crisp of the Week, after all), otherwise whichever snack type has the most
 * to choose from. Both come from the same type, so it's a fair fight, and
 * from the POOL_SIZE most checked-in snacks of that type. `random` is there
 * so tests can make it predictable.
 */
export async function pickPair(
  db: D1Database,
  weekStart: number,
  opts: { exclude?: string[]; random?: () => number } = {},
): Promise<[string, string] | null> {
  const random = opts.random ?? Math.random;
  const { results: recent } = await db
    .prepare("SELECT snack_a, snack_b FROM cotw_battles WHERE week_start >= ? AND week_start < ?")
    .bind(weekStart - REST_WEEKS * WEEK, weekStart)
    .all<{ snack_a: string; snack_b: string }>();
  const resting = new Set([...(opts.exclude ?? []), ...recent.flatMap((r) => [r.snack_a, r.snack_b])]);

  const { results } = await db
    .prepare(
      `SELECT s.id, s.category_id AS category, COUNT(c.id) AS n
         FROM snacks s LEFT JOIN checkins c ON c.snack_id = s.id AND c.scored = 1
        WHERE s.status = 'approved'
        GROUP BY s.id
        ORDER BY n DESC, s.name`,
    )
    .all<{ id: string; category: string; n: number }>();

  const byType = new Map<string, string[]>();
  for (const r of results) {
    if (resting.has(r.id)) continue;
    byType.set(r.category, [...(byType.get(r.category) ?? []), r.id]);
  }
  const crisps = byType.get("crisps") ?? [];
  const pool =
    crisps.length >= 2 ? crisps : [...byType.values()].filter((ids) => ids.length >= 2).sort((x, y) => y.length - x.length)[0];
  if (!pool) return null;

  const top = pool.slice(0, POOL_SIZE);
  const first = Math.floor(random() * top.length);
  let second = Math.floor(random() * (top.length - 1));
  if (second >= first) second++;
  return [top[first], top[second]];
}

/** This week's battle, picking one if nobody has opened it yet. Null if there aren't two snacks to pick. */
export async function ensureBattle(db: D1Database, nowSeconds: number, opts: { exclude?: string[]; random?: () => number } = {}): Promise<BattleRow | null> {
  const week = periodStart("weekly", nowSeconds);
  const read = () => db.prepare("SELECT week_start, snack_a, snack_b FROM cotw_battles WHERE week_start = ?").bind(week).first<BattleRow>();
  const existing = await read();
  if (existing) return existing;
  const pair = await pickPair(db, week, opts);
  if (!pair) return null;
  await db
    .prepare("INSERT OR IGNORE INTO cotw_battles (week_start, snack_a, snack_b, created_at) VALUES (?, ?, ?, ?)")
    .bind(week, pair[0], pair[1], nowSeconds)
    .run();
  return read();
}

/** Admins only: throw away this week's pair (and its votes) and pick two others. */
export async function repickBattle(db: D1Database, nowSeconds: number, random?: () => number): Promise<BattleRow | null> {
  const week = periodStart("weekly", nowSeconds);
  const old = await db.prepare("SELECT snack_a, snack_b FROM cotw_battles WHERE week_start = ?").bind(week).first<{ snack_a: string; snack_b: string }>();
  await db.batch([
    db.prepare("DELETE FROM cotw_votes WHERE week_start = ?").bind(week),
    db.prepare("DELETE FROM cotw_battles WHERE week_start = ?").bind(week),
  ]);
  return ensureBattle(db, nowSeconds, { exclude: old ? [old.snack_a, old.snack_b] : [], random });
}

/** A battle as the app shows it. Votes are left out of the current week until you've voted. */
export async function battleView(db: D1Database, row: BattleRow, viewerId: string, nowSeconds: number): Promise<Battle> {
  const past = row.week_start < periodStart("weekly", nowSeconds);
  const snackSql = `SELECT s.id, s.name, s.brand, s.category_id AS category, (${LATEST_PHOTO}) AS photoId FROM snacks s WHERE s.id = ?`;
  const [a, b, counts, mine] = await Promise.all([
    db.prepare(snackSql).bind(row.snack_a).first<BattleSnack>(),
    db.prepare(snackSql).bind(row.snack_b).first<BattleSnack>(),
    db
      .prepare(
        `SELECT COALESCE(SUM(snack_id = ?2), 0) AS a, COALESCE(SUM(snack_id = ?3), 0) AS b FROM cotw_votes WHERE week_start = ?1`,
      )
      .bind(row.week_start, row.snack_a, row.snack_b)
      .first<{ a: number; b: number }>(),
    db
      .prepare("SELECT snack_id FROM cotw_votes WHERE week_start = ? AND user_id = ?")
      .bind(row.week_start, viewerId)
      .first<{ snack_id: string }>(),
  ]);
  const votes = { a: counts?.a ?? 0, b: counts?.b ?? 0 };
  const battle: Battle = {
    weekStart: row.week_start,
    endsAt: row.week_start + WEEK,
    a: a!,
    b: b!,
    votes: past || mine ? votes : null,
    myVote: mine?.snack_id ?? null,
  };
  if (past) battle.winner = winnerOf(row, votes);
  return battle;
}

export const winnerOf = (row: BattleRow, votes: { a: number; b: number }) =>
  votes.a > votes.b ? row.snack_a : votes.b > votes.a ? row.snack_b : null;

/** The most recent finished battle, if any. */
export async function lastBattle(db: D1Database, nowSeconds: number): Promise<BattleRow | null> {
  return db
    .prepare("SELECT week_start, snack_a, snack_b FROM cotw_battles WHERE week_start < ? ORDER BY week_start DESC LIMIT 1")
    .bind(periodStart("weekly", nowSeconds))
    .first<BattleRow>();
}

/**
 * Vote, or change your vote, in this week's battle. Returns an error message
 * if the snack isn't one of this week's two.
 */
export async function castVote(db: D1Database, userId: string, snackId: string, nowSeconds: number): Promise<string | null> {
  const battle = await ensureBattle(db, nowSeconds);
  if (!battle) return "There's no Crisp of the Week this week.";
  if (snackId !== battle.snack_a && snackId !== battle.snack_b) return "Pick one of this week's two.";
  await db
    .prepare(
      `INSERT INTO cotw_votes (week_start, user_id, snack_id, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (week_start, user_id) DO UPDATE SET snack_id = excluded.snack_id, created_at = excluded.created_at`,
    )
    .bind(battle.week_start, userId, snackId, nowSeconds)
    .run();
  return null;
}

/** "Monster Munch wins Crisp of the Week", in the person's voice. */
export function resultMessage(
  voice: string | null,
  names: { winner: string | null; a: string; b: string },
  pct: { a: number; b: number },
): { title: string; body: string } {
  const after = "This week's battle is up. Get your vote in.";
  if (!names.winner) {
    return { title: "Crisp of the Week: a dead heat", body: `${names.a} and ${names.b} finished level. ${after}` };
  }
  const [won, lost, wp, lp] = names.winner === names.a ? [names.a, names.b, pct.a, pct.b] : [names.b, names.a, pct.b, pct.a];
  return voice === "lad"
    ? { title: `${won} takes it`, body: `${won} battered ${lost} ${wp}% to ${lp}%. New battle's up. Get voting.` }
    : { title: `${won} is Crisp of the Week`, body: `${won} beat ${lost} ${wp}% to ${lp}%. ${after}` };
}

/**
 * Monday evening (the 18:00 UTC cron): tell everyone who voted last week who
 * won. result_sent is set before sending, so a retried cron can't send it twice.
 * Only people with check-in reminders on. Returns how many were told.
 */
export async function sendBattleResults(env: Env, origin: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<number> {
  const db = env.DB;
  const row = await db
    .prepare("SELECT week_start, snack_a, snack_b FROM cotw_battles WHERE week_start = ? AND result_sent = 0")
    .bind(periodStart("weekly", nowSeconds) - WEEK)
    .first<BattleRow>();
  if (!row) return 0;
  const claimed = await db.prepare("UPDATE cotw_battles SET result_sent = 1 WHERE week_start = ? AND result_sent = 0").bind(row.week_start).run();
  if (!claimed.meta.changes) return 0;

  const [names, counts, voters] = await Promise.all([
    db
      .prepare("SELECT (SELECT name FROM snacks WHERE id = ?1) AS a, (SELECT name FROM snacks WHERE id = ?2) AS b")
      .bind(row.snack_a, row.snack_b)
      .first<{ a: string; b: string }>(),
    db
      .prepare("SELECT COALESCE(SUM(snack_id = ?2), 0) AS a, COALESCE(SUM(snack_id = ?3), 0) AS b FROM cotw_votes WHERE week_start = ?1")
      .bind(row.week_start, row.snack_a, row.snack_b)
      .first<{ a: number; b: number }>(),
    db
      .prepare(
        `SELECT u.id, u.voice FROM cotw_votes v JOIN users u ON u.id = v.user_id
          WHERE v.week_start = ? AND u.reminders = 1`,
      )
      .bind(row.week_start)
      .all<{ id: string; voice: string | null }>(),
  ]);
  if (!names) return 0;
  const votes = { a: counts?.a ?? 0, b: counts?.b ?? 0 };
  const winnerId = winnerOf(row, votes);
  const winner = winnerId === row.snack_a ? names.a : winnerId === row.snack_b ? names.b : null;
  let told = 0;
  for (const v of voters.results) {
    const msg = resultMessage(v.voice, { winner, a: names.a, b: names.b }, percentages(votes.a, votes.b));
    if (await pushToUser(env, origin, v.id, { kind: "cotw", url: "/cotw", ...msg })) told++;
  }
  return told;
}
