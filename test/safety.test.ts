import { describe, expect, it } from "vitest";
import { isChangeRequest, readReport, reasonLabel } from "../shared/reports";
import { validateCheckin } from "../worker/lib/checkin";
import { validateGroup } from "../worker/lib/groups";
import { validateSnackFields } from "../worker/lib/validation";

describe("readReport", () => {
  it("accepts a check-in, person or snack with a known reason", () => {
    expect(readReport({ targetType: "checkin", targetId: "c1", reason: "rude", note: "  mean  " })).toEqual({
      ok: true,
      value: { targetType: "checkin", targetId: "c1", reason: "rude", note: "mean" },
    });
    expect(readReport({ targetType: "snack", targetId: "s1", reason: "wrong" }).ok).toBe(true);
  });

  it("refuses unknown targets and reasons", () => {
    expect(readReport({ targetType: "group", targetId: "g1", reason: "rude" }).ok).toBe(false);
    expect(readReport({ targetType: "user", targetId: "u1", reason: "boring" }).ok).toBe(false);
    expect(readReport({ targetType: "user", targetId: "", reason: "rude" }).ok).toBe(false);
  });
});

describe("the bad-word filter is used", () => {
  it("on reviews", () => {
    const r = validateCheckin({ snackId: "s", overall: 4, review: "absolute wanker of a crisp" }, "crisps");
    expect(r).toEqual({ ok: false, error: "Let's keep it friendly. Please change the review." });
    expect(validateCheckin({ snackId: "s", overall: 4, review: "a bit shit tbh" }, "crisps").ok).toBe(true);
  });

  it("on snack names and makers", () => {
    expect(validateSnackFields({ name: "Fuck Puffs", brand: "", category: "crisps" }, () => true).ok).toBe(false);
    expect(validateSnackFields({ name: "Scampi Fries", brand: "Smiths", category: "pub" }, () => true).ok).toBe(true);
  });

  it("on group names", () => {
    expect(validateGroup({ name: "Twats united", scoringMode: "points", resetPeriod: "never", categories: [] }).ok).toBe(false);
  });
});

describe("snack change requests", () => {
  it("are allowed for snacks only, and need a note", () => {
    expect(readReport({ targetType: "snack", targetId: "s1", reason: "details", note: "Name: A → B" }).ok).toBe(true);
    expect(readReport({ targetType: "snack", targetId: "s1", reason: "photo", note: "" }).ok).toBe(false);
    expect(readReport({ targetType: "checkin", targetId: "c1", reason: "details", note: "x" }).ok).toBe(false);
  });

  it("have their own labels", () => {
    expect(isChangeRequest("photo")).toBe(true);
    expect(isChangeRequest("rude")).toBe(false);
    expect(reasonLabel("details")).toBe("Change name, maker or type");
  });
});
