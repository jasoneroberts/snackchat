import { describe, expect, it } from "vitest";
import { pointsFor, startOfUtcDay, validateCheckin } from "../worker/lib/checkin";

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
    expect(pointsFor({ firstTime: true, hasPhoto: false, review: null, earnedToday: 0 })).toEqual([
      { reason: "new_snack", points: 10 },
    ]);
    expect(pointsFor({ firstTime: false, hasPhoto: false, review: null, earnedToday: 0 })).toEqual([
      { reason: "repeat", points: 2 },
    ]);
  });

  it("adds photo and long-review bonuses", () => {
    const lines = pointsFor({ firstTime: true, hasPhoto: true, review: longReview, earnedToday: 0 });
    expect(lines.reduce((sum, l) => sum + l.points, 0)).toBe(15);
    expect(pointsFor({ firstTime: true, hasPhoto: false, review: "short", earnedToday: 0 })).toHaveLength(1);
  });

  it("stops at the daily cap of 100", () => {
    expect(pointsFor({ firstTime: true, hasPhoto: true, review: longReview, earnedToday: 95 })).toEqual([
      { reason: "new_snack", points: 5 },
    ]);
    expect(pointsFor({ firstTime: true, hasPhoto: true, review: null, earnedToday: 100 })).toEqual([]);
  });
});

it("startOfUtcDay rounds down to midnight UTC", () => {
  expect(startOfUtcDay(Date.UTC(2026, 9, 22, 19, 30) / 1000)).toBe(Date.UTC(2026, 9, 22) / 1000);
});
