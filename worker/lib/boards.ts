import type { BoardPeriod } from "../../shared/types";
import { periodStart } from "./groups";

export const BOARD_PERIODS: BoardPeriod[] = ["week", "month", "all"];

/** Start of a Boards period: this week (from Monday), this month, or all time. */
export function boardStart(period: BoardPeriod, nowSeconds: number): number {
  return periodStart(period === "week" ? "weekly" : period === "month" ? "monthly" : "never", nowSeconds);
}

// This month and All time only rank snacks with at least this many ratings,
// so a snack one person tried once can't sit at the top. This week shows
// everything, as there's rarely that much in a week.
export const MIN_RATINGS = 3;
export const minRatingsFor = (period: BoardPeriod) => (period === "week" ? 1 : MIN_RATINGS);

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
