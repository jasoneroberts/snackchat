import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../shared/catalogue";
import { filterFor, filterShort, filterTypes, REST, TYPE_ORDER, typeFilters } from "../shared/typeFilters";

describe("snack type filters", () => {
  it("lad mode has the short list, in Jase's order", () => {
    expect(typeFilters("lad").map((f) => f.label)).toEqual(["All", "Crisps", "Choc", "Chews", "Biscuits", "Nuts", "Rest"]);
  });

  it("grown-up mode lists every type, in the same order", () => {
    expect(typeFilters("grownup").map((f) => f.id)).toEqual(["", ...TYPE_ORDER]);
  });

  it("every type is in the order exactly once", () => {
    expect([...TYPE_ORDER].sort()).toEqual(CATEGORIES.map((c) => c.id).sort());
  });

  it("Rest covers the types without their own lad pill", () => {
    expect(filterTypes(REST)).toEqual(["kids", "world", "healthy"]);
    expect(filterShort(REST)).toBe("the rest");
  });

  it("one type, or everything for All and unknown ids", () => {
    expect(filterTypes("crisps")).toEqual(["crisps"]);
    expect(filterTypes("")).toBeNull();
    expect(filterTypes("nonsense")).toBeNull();
    expect(filterTypes(undefined)).toBeNull();
  });

  it("Rest falls back to All in grown-up mode", () => {
    expect(filterFor("grownup", REST)).toBe("");
    expect(filterFor("lad", REST)).toBe(REST);
    expect(filterFor("grownup", "kids")).toBe("kids");
    expect(filterFor("lad", "kids")).toBe("");
  });
});
