import { describe, expect, it } from "vitest";
import { pointsFor, startOfUtcDay, validateCheckin } from "../worker/lib/checkin";
import { attributesFor, isCrunchy } from "../shared/catalogue";

const base = { snackId: "seed-frazzles", overall: 4.25 };

describe("validateCheckin", () => {
  it("accepts a minimal check-in", () => {
    const r = validateCheckin(base, "crisps");
    expect(r).toEqual({
      ok: true,
      value: { ...base, attributes: {}, review: null, venue: null, pairedWith: null },
    });
  });

  it("only allows quarter-star steps from 0.25 to 5", () => {
    expect(validateCheckin({ ...base, overall: 0.25 }, "crisps").ok).toBe(true);
    expect(validateCheckin({ ...base, overall: 5 }, "crisps").ok).toBe(true);
    expect(validateCheckin({ ...base, overall: 0 }, "crisps").ok).toBe(false);
    expect(validateCheckin({ ...base, overall: 3.3 }, "crisps").ok).toBe(false);
    expect(validateCheckin({ ...base, overall: 5.25 }, "crisps").ok).toBe(false);
    expect(validateCheckin({ ...base, overall: "lots" }, "crisps").ok).toBe(false);
  });

  it("accepts universal and category sliders, and drops skipped ones", () => {
    const r = validateCheckin({ ...base, attributes: { flavour: 5, crunch: 4, spice: 0, grease: null } }, "crisps");
    expect(r.ok && r.value.attributes).toEqual({ flavour: 5, crunch: 4 });
  });

  it("rejects sliders from another category or out of range", () => {
    expect(validateCheckin({ ...base, attributes: { dunk: 3 } }, "crisps").ok).toBe(false);
    expect(validateCheckin({ ...base, attributes: { crunch: 6 } }, "crisps").ok).toBe(false);
    expect(validateCheckin({ ...base, attributes: { crunch: 2.5 } }, "crisps").ok).toBe(false);
  });

  it("trims text and limits its length", () => {
    const r = validateCheckin({ ...base, review: "  lovely  ", venue: "   " }, "crisps");
    expect(r.ok && r.value.review).toBe("lovely");
    expect(r.ok && r.value.venue).toBe(null);
    expect(validateCheckin({ ...base, review: "x".repeat(1001) }, "crisps").ok).toBe(false);
  });
});

describe("pointsFor", () => {
  const longReview = "x".repeat(50);

  it("gives 10 for a new snack and 2 for a repeat", () => {
    expect(pointsFor({ firstTime: true, crunchy: false, hasPhoto: false, review: null, earnedToday: 0 })).toEqual([
      { reason: "new_snack", points: 10 },
    ]);
    expect(pointsFor({ firstTime: false, crunchy: false, hasPhoto: false, review: null, earnedToday: 0 })).toEqual([
      { reason: "repeat", points: 2 },
    ]);
  });

  it("adds photo and long-review bonuses", () => {
    const lines = pointsFor({ firstTime: true, crunchy: false, hasPhoto: true, review: longReview, earnedToday: 0 });
    expect(lines.reduce((sum, l) => sum + l.points, 0)).toBe(15);
    expect(pointsFor({ firstTime: true, crunchy: false, hasPhoto: false, review: "short", earnedToday: 0 })).toHaveLength(1);
  });

  it("adds a crunch bonus for crunchy snack types: 3 on a first try, 1 on a repeat", () => {
    expect(pointsFor({ firstTime: true, crunchy: true, hasPhoto: false, review: null, earnedToday: 0 })).toEqual([
      { reason: "new_snack", points: 10 },
      { reason: "crunch", points: 3 },
    ]);
    expect(pointsFor({ firstTime: false, crunchy: true, hasPhoto: false, review: null, earnedToday: 0 })).toEqual([
      { reason: "repeat", points: 2 },
      { reason: "crunch", points: 1 },
    ]);
    // A full crisp check-in is 18 against 15 for sweets: a lean, not a penalty.
    const crisp = pointsFor({ firstTime: true, crunchy: true, hasPhoto: true, review: longReview, earnedToday: 0 });
    expect(crisp.reduce((sum, l) => sum + l.points, 0)).toBe(18);
  });

  it("only gives the crunch bonus to crisps, nuts, popcorn and crackers", () => {
    expect(["crisps", "nuts", "popcorn", "crackers"].every(isCrunchy)).toBe(true);
    expect(["chocolate", "chews", "biscuits", "healthy"].some(isCrunchy)).toBe(false);
  });

  it("lets health food be rated on crunch", () => {
    expect(attributesFor("healthy").map((a) => a.key)).toContain("crunch");
  });

  it("stops at the daily cap of 100", () => {
    expect(pointsFor({ firstTime: true, crunchy: false, hasPhoto: true, review: longReview, earnedToday: 95 })).toEqual([
      { reason: "new_snack", points: 5 },
    ]);
    expect(pointsFor({ firstTime: true, crunchy: false, hasPhoto: true, review: null, earnedToday: 100 })).toEqual([]);
  });
});

it("startOfUtcDay rounds down to midnight UTC", () => {
  expect(startOfUtcDay(Date.UTC(2026, 9, 22, 19, 30) / 1000)).toBe(Date.UTC(2026, 9, 22) / 1000);
});
