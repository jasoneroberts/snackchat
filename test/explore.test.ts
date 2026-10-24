import { describe, expect, it } from "vitest";
import { attributesFor } from "../shared/catalogue";
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
    { id: "chocolate", prefs, averages: { flavour: 3, salt: 1, sweet: 5 }, rating: 4.5 },
    { id: "vinegar", prefs, averages: { flavour: 5, salt: 5, sweet: 1 }, rating: 3.5 },
    { id: "cheese", prefs, averages: { flavour: 4, salt: 4, sweet: 1 }, rating: 4 },
    { id: "unrated", prefs, averages: {}, rating: 5 },
  ];

  it("puts the closest match first and drops snacks it can't score", () => {
    expect(rankMatches(snacks).map((s) => s.id)).toEqual(["vinegar", "cheese", "chocolate"]);
  });

  it("breaks a tie with the better-rated snack", () => {
    const tied = [
      { id: "a", prefs, averages: { flavour: 5, salt: 5 }, rating: 3 },
      { id: "b", prefs, averages: { flavour: 5, salt: 5 }, rating: 4.2 },
    ];
    expect(rankMatches(tied).map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("matches each snack on your taste for its own type", () => {
    const hotCrisps = { flavour: 5, spice: 5, crunch: 5 };
    const mildChocolate = { flavour: 3, sweet: 5, melt: 5 };
    const ranked = rankMatches([
      { id: "takis", prefs: hotCrisps, averages: { flavour: 5, spice: 5, crunch: 4 }, rating: 3 },
      { id: "dairy-milk", prefs: mildChocolate, averages: { flavour: 3, sweet: 5, melt: 5 }, rating: 3 },
      { id: "ready-salted", prefs: hotCrisps, averages: { flavour: 2, spice: 1, crunch: 3 }, rating: 5 },
    ]);
    expect(ranked.map((s) => s.id)).toEqual(["dairy-milk", "takis", "ready-salted"]);
  });
});

describe("readPreferences", () => {
  const crisps = attributesFor("crisps").map((a) => a.key);

  it("keeps 1-5 values for the type's sliders and drops blanks and other keys", () => {
    expect(readPreferences({ flavour: 4, salt: null, spice: 5, grease: 1, melt: 5 }, crisps)).toEqual({ flavour: 4, spice: 5, grease: 1 });
  });

  it("only takes a type's own sliders: no spice for chocolate", () => {
    const chocolate = attributesFor("chocolate").map((a) => a.key);
    expect(readPreferences({ spice: 5, melt: 4, rich: 5 }, chocolate)).toEqual({ melt: 4, rich: 5 });
  });

  it("rejects anything off the scale", () => {
    expect(readPreferences({ flavour: 6 }, crisps)).toBeNull();
    expect(readPreferences({ flavour: 2.5 }, crisps)).toBeNull();
    expect(readPreferences({ flavour: "4" }, crisps)).toBeNull();
    expect(readPreferences(null, crisps)).toBeNull();
  });
});
