import { describe, expect, it } from "vitest";
import { cleanRef, refLabel } from "../shared/ref";
import { inviteCodeFromPath, invitePreview, previewTags } from "../worker/lib/linkPreview";
import { validateQuickSignIn } from "../worker/lib/quickSignIn";
import { wrap } from "../src/lib/textWrap";

describe("cleanRef", () => {
  it("keeps simple sources, in lower case", () => {
    expect(cleanRef("pub")).toBe("pub");
    expect(cleanRef(" TikTok ")).toBe("tiktok");
    expect(cleanRef("insta_story-2")).toBe("insta_story-2");
  });

  it("drops anything odd, empty or too long", () => {
    expect(cleanRef("")).toBeNull();
    expect(cleanRef("<script>")).toBeNull();
    expect(cleanRef("a b")).toBeNull();
    expect(cleanRef("x".repeat(33))).toBeNull();
    expect(cleanRef(42)).toBeNull();
    expect(cleanRef(undefined)).toBeNull();
  });

  it("labels people with no ref", () => {
    expect(refLabel(null)).toBe("no link");
    expect(refLabel("pub")).toBe("pub");
  });

  it("comes through quick sign-in, cleaned", () => {
    const ok = (ref: unknown) => validateQuickSignIn({ username: "sam_k", pin: "1234", ref });
    expect(ok("Pub")).toMatchObject({ ok: true, value: { ref: "pub" } });
    expect(ok("drop table")).toMatchObject({ ok: true, value: { ref: null } });
    expect(ok(undefined)).toMatchObject({ ok: true, value: { ref: null } });
  });
});

describe("squad invite link previews", () => {
  it("finds the code in an invite path", () => {
    expect(inviteCodeFromPath("/join/ab12cd")).toBe("AB12CD");
    expect(inviteCodeFromPath("/join/AB12CD/")).toBe("AB12CD");
    expect(inviteCodeFromPath("/join/")).toBeNull();
    expect(inviteCodeFromPath("/join/a/b")).toBeNull();
    expect(inviteCodeFromPath("/groups/abc")).toBeNull();
    expect(inviteCodeFromPath("/join/x")).toBeNull();
  });

  it("names the squad and counts its people", () => {
    const p = invitePreview({ name: "Roberts snacks", members: 6 }, "https://getcrunchd.com", "https://getcrunchd.com/join/AB12CD");
    expect(p.title).toBe("Join Roberts snacks on Crunchd");
    expect(p.description).toContain("6 people are rating snacks in Roberts snacks");
    expect(p.image).toBe("https://getcrunchd.com/og-image.png");
    expect(invitePreview({ name: "Solo", members: 1 }, "o", "u").description).toContain("1 person is");
  });

  it("escapes squad names so they can't break out of the tag", () => {
    const tags = previewTags(invitePreview({ name: `"><script>alert(1)</script>`, members: 2 }, "https://x", "https://x/join/A"));
    expect(tags).not.toContain("<script>");
    expect(tags).toContain("&quot;&gt;&lt;script&gt;");
    expect(tags).toContain('<meta property="og:image" content="https://x/og-image.png" />');
  });
});

describe("share picture text wrapping", () => {
  // Every character is 10px wide.
  const ctx = { measureText: (s: string) => ({ width: s.length * 10 }) };

  it("keeps short names on one line", () => {
    expect(wrap(ctx, "Scampi Fries", 200, 2)).toEqual(["Scampi Fries"]);
  });

  it("wraps long names and cuts with … past the line limit", () => {
    expect(wrap(ctx, "Walkers Max Paprika", 120, 2)).toEqual(["Walkers Max", "Paprika"]);
    const cut = wrap(ctx, "one two three four five six", 90, 2);
    expect(cut).toHaveLength(2);
    expect(cut[1].endsWith("…")).toBe(true);
    expect(cut.every((l) => l.length * 10 <= 90)).toBe(true);
  });

  it("shortens a single word that's too wide", () => {
    expect(wrap(ctx, "Supercalifragilistic", 100, 2)).toEqual(["Supercali…"]);
  });
});
