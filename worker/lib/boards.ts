import type { BoardPeriod } from "../../shared/types";
import { periodStart } from "./groups";

export const BOARD_PERIODS: BoardPeriod[] = ["week", "month", "all"];

/** Start of a Boards period: this week (from Monday), this month, or all time. */
export function boardStart(period: BoardPeriod, nowSeconds: number): number {
  return periodStart(period === "week" ? "weekly" : period === "month" ? "monthly" : "never", nowSeconds);
}

// A snack with only one rating gets a pretend second rating of 2.5 (a middling
// score) when ranking, so one person's 5 stars can't put it top of the board.
// As soon as a second real rating arrives the pretend one is dropped. It only
// changes the order: the board still shows the real average and count.
export const STAND_IN_RATING = 2.5;

/** The average and count used for ranking, with the stand-in for a lone rating. */
export function rankingAverage(avg: number, count: number): { avg: number; count: number } {
  return count === 1 ? { avg: (avg + STAND_IN_RATING) / 2, count: 2 } : { avg, count };
}

// How many average-ish ratings each snack starts with. Without it, one 5-star
// check-in would put a snack above one rated 4.8 by twenty people.
export const PRIOR_WEIGHT = 3;

/**
 * Bayesian average: pulls snacks with few ratings towards the overall mean,
 * so the board rewards snacks that lots of people rate highly.
 */
export function weightedRating(avg: number, count: number, overallMean: number, prior = PRIOR_WEIGHT): number {
  return (avg * count + overallMean * prior) / (count + prior);
}

/** A snack's place on the board: the stand-in rule, then the weighted average. */
export function boardScore(avg: number, count: number, overallMean: number): number {
  const r = rankingAverage(avg, count);
  return weightedRating(r.avg, r.count, overallMean);
}
