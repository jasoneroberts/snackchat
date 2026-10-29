import { describe, expect, it } from "vitest";
import { dailyLimitError, isWrite } from "../worker/lib/limits";

describe("limits", () => {
  it("only counts changes towards the burst limit", () => {
    expect(isWrite("POST")).toBe(true);
    expect(isWrite("DELETE")).toBe(true);
    expect(isWrite("GET")).toBe(false);
  });

  it("says which daily limit was hit", () => {
    expect(dailyLimitError("checkins")).toContain("40");
    expect(dailyLimitError("snacks")).toContain("new snacks");
  });
});
