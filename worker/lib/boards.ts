import type { BoardPeriod } from "../../shared/types";
import { periodStart } from "./groups";

export const BOARD_PERIODS: BoardPeriod[] = ["week", "month", "all"];

/** Start of a Boards period: this week (from Monday), this month, or all time. */
export function boardStart(period: BoardPeriod, nowSeconds: number): number {
  return periodStart(period === "week" ? "weekly" : period === "month" ? "monthly" : "never", nowSeconds);
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
