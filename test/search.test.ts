import { expect, it } from "vitest";
import { searchPatterns } from "../worker/lib/search";

it("makes one pattern per word and skips filler words", () => {
  expect(searchPatterns("Walkers  Salt & Vinegar")).toEqual(["%walkers%", "%salt%", "%vinegar%"]);
  expect(searchPatterns("cheese and onion")).toEqual(["%cheese%", "%onion%"]);
});

it("escapes LIKE wildcards", () => {
  expect(searchPatterns("100%_off")).toEqual(["%100\\%\\_off%"]);
});

it("returns nothing for empty text", () => {
  expect(searchPatterns(undefined)).toEqual([]);
  expect(searchPatterns("   ")).toEqual([]);
  expect(searchPatterns("and &")).toEqual([]);
});

it("ignores apostrophes", () => {
  expect(searchPatterns("McCoy’s Nice 'n' Spicy")).toEqual(["%mccoys%", "%nice%", "%spicy%"]);
});
