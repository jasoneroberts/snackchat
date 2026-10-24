import { describe, expect, it } from "vitest";
import { dietSql, readDiets } from "../shared/diet";
import { pickProduct, suggestDiet } from "../worker/lib/diet";

describe("suggestDiet", () => {
  it("trusts a vegan label and a gluten-free label", () => {
    const s = suggestDiet({ product_name: "Ready Salted", labels_tags: ["en:vegan", "en:no-gluten"] });
    expect(s).toMatchObject({ vegan: true, glutenFree: true });
  });

  it("says no to vegan when the ingredients have animal products", () => {
    expect(suggestDiet({ product_name: "Cheese & Onion", ingredients_analysis_tags: ["en:non-vegan"] }).vegan).toBe(false);
  });

  it("leaves 'maybe vegan' unknown", () => {
    expect(suggestDiet({ product_name: "x", ingredients_analysis_tags: ["en:maybe-vegan"] }).vegan).toBeNull();
  });

  it("only says gluten-free when the pack is labelled; gluten or traces is a no", () => {
    expect(suggestDiet({ product_name: "x" }).glutenFree).toBeNull();
    expect(suggestDiet({ product_name: "x", allergens_tags: ["en:gluten"] }).glutenFree).toBe(false);
    expect(suggestDiet({ product_name: "x", traces_tags: ["en:gluten"] }).glutenFree).toBe(false);
  });

  it("knows nothing about a snack it can't find", () => {
    expect(suggestDiet(null)).toMatchObject({ product: null, vegan: null, glutenFree: null });
  });
});

describe("pickProduct", () => {
  it("prefers the same maker, skipping nameless results", () => {
    const products = [{ brands: "Walkers" }, { product_name: "Own brand", brands: "Tesco" }, { product_name: "Quavers", brands: "Walkers" }];
    expect(pickProduct(products, "walkers")?.product_name).toBe("Quavers");
    expect(pickProduct(products, "Pringles")?.product_name).toBe("Own brand");
    expect(pickProduct([], "Walkers")).toBeNull();
  });
});

describe("diet filters", () => {
  it("reads known diets only", () => {
    expect(readDiets("vegan,gf,keto")).toEqual(["vegan", "gf"]);
    expect(readDiets(undefined)).toEqual([]);
  });

  it("turns them into fixed SQL conditions", () => {
    expect(dietSql(["vegan", "gf"])).toBe(" AND s.vegan = 1 AND s.gluten_free = 1");
    expect(dietSql([])).toBe("");
  });
});
