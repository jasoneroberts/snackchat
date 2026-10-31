// The maths behind the admin Stats page, kept apart from the database so it
// can be tested (test/stats.test.ts). worker/routes/stats.ts does the reading.

import type { StatsPerson, StatsSource, StatsWeek } from "../../shared/types";
import { weekNumber, weekStartOf } from "../../shared/achievements";

/** How many weeks the page looks back over, this week included. */
export const STATS_WEEKS = 8;

/** One "someone did something" row: who, which week, and the latest time in that week. */
export interface ActivityRow {
  userId: string;
  week: number;
  last: number;
}

export interface StatsUser {
  id: string;
  username: string;
  createdAt: number;
  ref: string | null;
  checkins: number;
}

/**
 * Turns raw activity into the weekly table, the sign-up sources and the
 * people list.
 *
 * "Active" in a week = did at least one thing that week. "Returning" =
 * active that week AND joined in an earlier week, so a brand new person
 * poking around on day one doesn't count as coming back.
 */
export function summarise(
  users: StatsUser[],
  activity: ActivityRow[],
  checkinWeeks: Map<number, number>,
  nowSeconds: number,
  weeksBack = STATS_WEEKS,
) {
  const thisWeek = weekNumber(nowSeconds);
  const firstWeek = thisWeek - weeksBack + 1;

  // userId -> the weeks they were active (a Set, as several sources can
  // report the same person in the same week), and their latest action.
  const activeWeeks = new Map<string, Set<number>>();
  const lastActive = new Map<string, number>();
  const known = new Set(users.map((u) => u.id));
  for (const row of activity) {
    if (!known.has(row.userId) || row.week < firstWeek || row.week > thisWeek) continue;
    let weeks = activeWeeks.get(row.userId);
    if (!weeks) activeWeeks.set(row.userId, (weeks = new Set()));
    weeks.add(row.week);
    lastActive.set(row.userId, Math.max(lastActive.get(row.userId) ?? 0, row.last));
  }
  const joinWeek = new Map(users.map((u) => [u.id, weekNumber(u.createdAt)]));
  const isActive = (id: string, week: number) => activeWeeks.get(id)?.has(week) ?? false;

  const weeks: StatsWeek[] = [];
  for (let week = thisWeek; week >= firstWeek; week--) {
    let active = 0;
    let returning = 0;
    let joined = 0;
    for (const u of users) {
      const jw = joinWeek.get(u.id)!;
      if (jw === week) joined++;
      if (isActive(u.id, week)) {
        active++;
        if (jw < week) returning++;
      }
    }
    weeks.push({ weekStart: weekStartOf(week), joined, active, returning, checkins: checkinWeeks.get(week) ?? 0 });
  }

  // Sign-up sources, biggest first, "came straight in" (null) last.
  const byRef = new Map<string | null, StatsSource>();
  for (const u of users) {
    const s = byRef.get(u.ref) ?? { ref: u.ref, joined: 0, checkedIn: 0, activeThisWeek: 0 };
    s.joined++;
    if (u.checkins > 0) s.checkedIn++;
    if (isActive(u.id, thisWeek)) s.activeThisWeek++;
    byRef.set(u.ref, s);
  }
  const sources = [...byRef.values()].sort((a, b) => (a.ref === null ? 1 : b.ref === null ? -1 : b.joined - a.joined));

  const everyone: StatsPerson[] = users
    .map((u) => ({
      username: u.username,
      joinedAt: u.createdAt,
      ref: u.ref,
      checkins: u.checkins,
      lastActive: lastActive.get(u.id) ?? null,
      weeksActive: activeWeeks.get(u.id)?.size ?? 0,
      activeThisWeek: isActive(u.id, thisWeek),
    }))
    .sort((a, b) => (b.lastActive ?? 0) - (a.lastActive ?? 0) || b.joinedAt - a.joinedAt);

  // Of the people active last week, how many have been active this week too.
  const keptFromLastWeek = users.filter((u) => isActive(u.id, thisWeek - 1) && isActive(u.id, thisWeek)).length;

  return {
    people: users.length,
    keptFromLastWeek,
    activeThisWeek: weeks[0].active,
    returningThisWeek: weeks[0].returning,
    weeks,
    sources,
    everyone,
  };
}
