import { describe, expect, it } from "vitest";
import { badWordError, hasBadWord } from "../shared/badWords";

describe("hasBadWord", () => {
  it("blocks strong swearing and slurs, however they're spelt", () => {
    for (const t of ["what the fuck", "FUCKING tasty", "f.u.c.k", "f u c k this", "phuck_fuk", "you twat", "TWATS", "big_n1gger", "c u n t", "cunts", "w@nker", "Total bellend"]) {
      expect(hasBadWord(t), t).toBe(true);
    }
  });

  it("leaves ordinary words alone", () => {
    for (const t of [
      "Scunthorpe pub snacks", "Cocktail sausages", "Dickens would approve", "Shiitake crisps", "spicy as you like",
      "Pussycat biscuits? no", "Hancock's toffee", "Grape and raspberry", "therapist recommended", "Skittles",
      "A bit shit tbh", "bloody lovely", "absolute crap", "Crunchd", "Wotsits", "Peanuts", "classic", "assessment",
    ]) {
      expect(hasBadWord(t), t).toBe(false);
    }
  });

  it("names the field to change", () => {
    expect(badWordError({ review: "lovely", name: "bitch crisps" })).toBe("Let's keep it friendly. Please change the name.");
    expect(badWordError({ review: "lovely", name: null })).toBeNull();
  });
});
