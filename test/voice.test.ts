import { describe, expect, it } from "vitest";
import { LINES, isVoice, line } from "../shared/voice";

describe("line", () => {
  it("uses grown-up words by default", () => {
    expect(line("grownup", "checkin.submit")).toBe("Check in");
  });

  it("says crunch for crunchy snacks and munch for the rest", () => {
    expect(line("lad", "checkin.submit", { category: "crisps" })).toBe("Log the crunch");
    expect(line("lad", "checkin.submit", { category: "chocolate" })).toBe("Log the munch");
    expect(line("lad", "checkin.busy", { category: "nuts" })).toBe("Crunching…");
    expect(line("lad", "checkin.busy", { category: "biscuits" })).toBe("Munching…");
  });

  it("says crunch when no snack is picked yet", () => {
    expect(line("lad", "checkin.search")).toBe("What you crunching?");
  });

  it("keeps kids snacks grown-up even in lad mode", () => {
    expect(line("lad", "checkin.submit", { category: "kids" })).toBe("Check in");
    expect(line("lad", "checkin.where", { category: "kids" })).toBe("Where?");
  });

  it("fills in values in both voices", () => {
    const vars = { chars: 10, pts: 5 };
    expect(line("grownup", "checkin.reviewPlaceholder", { vars })).toBe("How was it? (10+ characters earns +5 pts)");
    expect(line("lad", "checkin.reviewPlaceholder", { vars })).toBe("Go on then. (10+ characters bags +5 pts)");
  });

  it("falls back to grown-up when a line has no lad version", () => {
    expect(line("lad", "voice.lad")).toBe("Lad mode");
  });

  it("leaves no placeholder unfilled in any lad line", () => {
    for (const key of Object.keys(LINES) as (keyof typeof LINES)[]) {
      const text = line("lad", key, { category: "crisps" });
      expect(text.match(/\{(snack|Snack|snacking|Snacking)\}/), key).toBeNull();
    }
  });
});

describe("isVoice", () => {
  it("accepts only the two voices", () => {
    expect(isVoice("lad")).toBe(true);
    expect(isVoice("grownup")).toBe(true);
    expect(isVoice("sweary")).toBe(false);
    expect(isVoice(null)).toBe(false);
  });
});
