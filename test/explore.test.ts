import { describe, expect, it } from "vitest";
import { type Candidate, matchScore, rankMatches, readPreferences } from "../worker/lib/explore";

describe("matchScore", () => {
  it("is 100% when the snack's averages are exactly your taste", () => {
    expect(matchScore({ flavour: 4, salt: 5 }, { flavour: 4, salt: 5, sweet: 1 })).toBe(1);
  });

  it("is 0% when every slider is at the opposite end", () => {
    expect(matchScore({ salt: 5, sweet: 1 }, { salt: 1, sweet: 5 })).toBe(0);
  });

  it("averages the gaps: one point off on each of two sliders is 75%", () => {
    expect(matchScore({ flavour: 4, salt: 4 }, { flavour: 3, salt: 5 })).toBe(0.75);
  });

  it("ignores sliders you don't mind about", () => {
    expect(matchScore({ flavour: 5, salt: 5 }, { flavour: 5, salt: 5, sweet: 5, value: 1 })).toBe(1);
  });

  it("needs two sliders in common, so one lucky match can't win", () => {
    expect(matchScore({ flavour: 5, salt: 5, sweet: 1 }, { flavour: 5 })).toBeNull();
    expect(matchScore({ flavour: 5, salt: 5, sweet: 1 }, { flavour: 5, sweet: 2 })).toBeCloseTo(1 - 0.5 / 4);
  });

  it("works with a single preference when that's all you set", () => {
    expect(matchScore({ sweet: 5 }, { sweet: 4, salt: 1 })).toBe(0.75);
  });

  it("can't score anything without preferences", () => {
    expect(matchScore({}, { flavour: 3, salt: 3 })).toBeNull();
  });
});

describe("rankMatches", () => {
  const prefs = { flavour: 5, salt: 5, sweet: 1 };
  const snacks: Candidate[] = [
    { id: "chocolate", averages: { flavour: 3, salt: 1, sweet: 5 }, rating: 4.5 },
    { id: "vinegar", averages: { flavour: 5, salt: 5, sweet: 1 }, rating: 3.5 },
    { id: "cheese", averages: { flavour: 4, salt: 4, sweet: 1 }, rating: 4 },
    { id: "unrated", averages: {}, rating: 5 },
  ];

  it("puts the closest match first and drops snacks it can't score", () => {
    expect(rankMatches(prefs, snacks).map((s) => s.id)).toEqual(["vinegar", "cheese", "chocolate"]);
  });

  it("breaks a tie with the better-rated snack", () => {
    const tied = [
      { id: "a", averages: { flavour: 5, salt: 5 }, rating: 3 },
      { id: "b", averages: { flavour: 5, salt: 5 }, rating: 4.2 },
    ];
    expect(rankMatches(prefs, tied).map((s) => s.id)).toEqual(["b", "a"]);
  });
});

describe("readPreferences", () => {
  it("keeps 1-5 values and drops blanks and unknown keys", () => {
    expect(readPreferences({ flavour: 4, salt: null, sweet: 1, crunch: 5 })).toEqual({ flavour: 4, sweet: 1 });
  });

  it("rejects anything off the scale", () => {
    expect(readPreferences({ flavour: 6 })).toBeNull();
    expect(readPreferences({ flavour: 2.5 })).toBeNull();
    expect(readPreferences({ flavour: "4" })).toBeNull();
    expect(readPreferences(null)).toBeNull();
  });
});
