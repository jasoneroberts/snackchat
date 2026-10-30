import type { BoardPeriod } from "../../shared/types";
import { periodStart } from "./groups";

export const BOARD_PERIODS: BoardPeriod[] = ["week", "month", "all"];

/** Start of a Boards period: this week (from Monday), this month, or all time. */
export function boardStart(period: BoardPeriod, nowSeconds: number): number {
  return periodStart(period === "week" ? "weekly" : period === "month" ? "monthly" : "never", nowSeconds);
}

// A snack with only one rating gets a pretend second rating of 2.5 (a middling
// score), so one person's 5 stars can't put it top of the board: a lone 5
// shows and ranks as 3.75. As soon as a second real rating arrives the
// pretend one is dropped. Every average shown anywhere (the Table, a snack's
// page, the Hunt, a squad's favourite) uses this rule and ranks by exactly
// the number it shows, so the order always reads top to bottom. The app
// marks these averages "provisional" (one rating so far).
export const STAND_IN_RATING = 2.5;

/** A snack's board average: its real average, or with the stand-in for a lone rating. */
export function rankingAverage(avg: number, count: number): { avg: number; count: number } {
  return count === 1 ? { avg: (avg + STAND_IN_RATING) / 2, count: 2 } : { avg, count };
}

/**
 * The same rule in SQL, for queries that sort by it (a snack's rank in its
 * type, a squad's favourite). Use inside a GROUP BY over checkins c.
 */
export const BOARD_AVG_SQL = `(CASE WHEN COUNT(*) = 1 THEN (AVG(c.overall) + ${STAND_IN_RATING}) / 2 ELSE AVG(c.overall) END)`;

// The Hunt's suggestions use a weighted average instead (worker/routes/explore.ts):
// how many average-ish ratings each snack starts with, so one 5-star check-in
// doesn't outrank a snack rated 4.8 by twenty people.
export const PRIOR_WEIGHT = 3;

/**
 * Bayesian average: pulls snacks with few ratings towards the overall mean,
 * so the board rewards snacks that lots of people rate highly.
 */
export function weightedRating(avg: number, count: number, overallMean: number, prior = PRIOR_WEIGHT): number {
  return (avg * count + overallMean * prior) / (count + prior);
}
