import { describe, expect, it } from "vitest";
import { buildDemoData, DEMO_GROUPS, DEMO_PREFIX, offSearchUrl } from "../worker/lib/demo";

describe("buildDemoData", () => {
  const now = 1_800_000_000;
  const data = buildDemoData(now);

  it("is the same every time", () => {
    expect(buildDemoData(now)).toEqual(data);
  });

  it("marks every row as demo so it can be removed", () => {
    for (const u of data.users) expect(u.id.startsWith(DEMO_PREFIX)).toBe(true);
    for (const c of data.checkins) expect(c.id.startsWith(DEMO_PREFIX)).toBe(true);
    for (const g of DEMO_GROUPS) expect(g.id.startsWith(DEMO_PREFIX)).toBe(true);
  });

  it("makes valid check-ins from the last three weeks", () => {
    expect(data.checkins.length).toBeGreaterThan(30);
    expect(new Set(data.checkins.map((c) => c.id)).size).toBe(data.checkins.length);
    for (const c of data.checkins) {
      expect(c.overall).toBeGreaterThanOrEqual(0.25);
      expect(c.overall).toBeLessThanOrEqual(5);
      expect((c.overall * 4) % 1).toBe(0);
      expect(c.createdAt).toBeLessThan(now);
      expect(c.createdAt).toBeGreaterThan(now - 22 * 24 * 3600);
      for (const v of Object.values(c.attributes)) expect(v).toBeGreaterThanOrEqual(1);
      for (const v of Object.values(c.attributes)) expect(v).toBeLessThanOrEqual(5);
    }
  });

  it("gives new-snack points once per person and snack, then repeat points", () => {
    const firsts = new Set<string>();
    for (const c of data.checkins) {
      const key = `${c.userId}:${c.snackId}`;
      expect(c.points[0].reason).toBe(firsts.has(key) ? "repeat" : "new_snack");
      firsts.add(key);
    }
  });

  it("only uses group members who exist", () => {
    const names = new Set(data.users.map((u) => u.username));
    for (const g of DEMO_GROUPS) for (const m of [g.owner, ...g.members]) expect(names.has(m)).toBe(true);
  });
});

it("searches Open Food Facts for UK products by brand and name", () => {
  const url = new URL(offSearchUrl("Frazzles", "Smiths"));
  expect(url.hostname).toBe("world.openfoodfacts.org");
  expect(url.searchParams.get("search_terms")).toBe("Smiths Frazzles");
  expect(url.searchParams.get("tag_0")).toBe("united-kingdom");
});
