import { expect, it } from "vitest";
import { boardStart, rankingAverage, weightedRating } from "../worker/lib/boards";

it("boards start on Monday, the 1st, or the beginning of time", () => {
  const thursday = Date.parse("2026-10-22T19:00:00Z") / 1000;
  expect(boardStart("week", thursday)).toBe(Date.parse("2026-10-19T00:00:00Z") / 1000);
  expect(boardStart("month", thursday)).toBe(Date.parse("2026-10-01T00:00:00Z") / 1000);
  expect(boardStart("all", thursday)).toBe(0);
});

it("a single 5-star rating doesn't beat a well-loved snack", () => {
  const mean = 3.8;
  const oneHit = weightedRating(5, 1, mean);
  const crowdFavourite = weightedRating(4.6, 20, mean);
  expect(crowdFavourite).toBeGreaterThan(oneHit);
});

it("with many ratings the weighted score approaches the real average", () => {
  expect(weightedRating(4.2, 1000, 3)).toBeCloseTo(4.2, 2);
});

it("a lone rating gets a stand-in 2.5 until a second real rating arrives", () => {
  expect(rankingAverage(5, 1)).toEqual({ avg: 3.75, count: 2 });
  expect(rankingAverage(5, 2)).toEqual({ avg: 5, count: 2 });
  // A lone 5 shows and ranks as 3.75, below two people's 4s.
  expect(rankingAverage(4, 2).avg).toBeGreaterThan(rankingAverage(5, 1).avg);
});
