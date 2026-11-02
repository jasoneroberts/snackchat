import { describe, expect, it } from "vitest";
import { isRecapDay } from "../src/lib/recapDay";

describe("isRecapDay", () => {
  it("is on for Monday and Tuesday, off the rest of the week (UK clock)", () => {
    // Mon 2 Nov 2026 to Sun 8 Nov 2026, midday UTC (GMT, so same day in London).
    const days = [2, 3, 4, 5, 6, 7, 8].map((d) => isRecapDay(new Date(Date.UTC(2026, 10, d, 12))));
    expect(days).toEqual([true, true, false, false, false, false, false]);
  });

  it("goes by London time, not UTC", () => {
    // 23:30 UTC on Sunday 29 Mar 2026 is 00:30 BST on Monday 30 Mar in London.
    expect(isRecapDay(new Date(Date.UTC(2026, 2, 29, 23, 30)))).toBe(true);
    // 23:30 UTC on Tuesday 31 Mar 2026 is already Wednesday in London.
    expect(isRecapDay(new Date(Date.UTC(2026, 2, 31, 23, 30)))).toBe(false);
  });
});
