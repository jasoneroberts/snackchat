import { describe, expect, it } from "vitest";
import { champions, lastWeek, newInviteCode, normaliseCode, periodEnd, periodStart, rank, validateGroup } from "../worker/lib/groups";

const at = (iso: string) => Date.parse(iso) / 1000;

describe("validateGroup", () => {
  it("fills in defaults", () => {
    expect(validateGroup({ name: "  Friday   Pub Crew " })).toEqual({
      ok: true,
      value: { name: "Friday Pub Crew", scoringMode: "points", resetPeriod: "weekly", categories: null },
    });
  });

  it("keeps a list of snack types and treats an empty list as all", () => {
    const r = validateGroup({ name: "Crisp off", categories: ["crisps", "crisps", "nuts"] });
    expect(r.ok && r.value.categories).toEqual(["crisps", "nuts"]);
    const all = validateGroup({ name: "Anything", categories: [] });
    expect(all.ok && all.value.categories).toBe(null);
  });

  it("rejects bad input", () => {
    expect(validateGroup({ name: "x" }).ok).toBe(false);
    expect(validateGroup({ name: "Fine", scoringMode: "vibes" }).ok).toBe(false);
    expect(validateGroup({ name: "Fine", resetPeriod: "daily" }).ok).toBe(false);
    expect(validateGroup({ name: "Fine", categories: ["rocks"] }).ok).toBe(false);
  });
});

describe("invite codes", () => {
  it("are six characters without look-alikes", () => {
    const code = newInviteCode();
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  });

  it("are matched ignoring case, spaces and dashes", () => {
    expect(normaliseCode(" k7q-xpm ")).toBe("K7QXPM");
  });
});

describe("leaderboard periods", () => {
  it("weekly boards run Monday to Monday (UTC)", () => {
    const thursday = at("2026-10-22T19:00:00Z");
    expect(periodStart("weekly", thursday)).toBe(at("2026-10-19T00:00:00Z"));
    expect(periodEnd("weekly", thursday)).toBe(at("2026-10-26T00:00:00Z"));
    const sunday = at("2026-10-25T23:59:00Z");
    expect(periodStart("weekly", sunday)).toBe(at("2026-10-19T00:00:00Z"));
  });

  it("monthly boards run from the 1st", () => {
    expect(periodStart("monthly", at("2026-12-31T10:00:00Z"))).toBe(at("2026-12-01T00:00:00Z"));
    expect(periodEnd("monthly", at("2026-12-31T10:00:00Z"))).toBe(at("2027-01-01T00:00:00Z"));
  });

  it("never-resetting boards count everything", () => {
    expect(periodStart("never", at("2026-10-22T00:00:00Z"))).toBe(0);
    expect(periodEnd("never", at("2026-10-22T00:00:00Z"))).toBe(null);
  });
});

it("rank shares places on ties", () => {
  const rows = [
    { username: "cat", value: 10 },
    { username: "amy", value: 30 },
    { username: "bob", value: 10 },
    { username: "dan", value: 0 },
  ];
  expect(rank(rows).map((r) => [r.username, r.rank])).toEqual([
    ["amy", 1],
    ["bob", 2],
    ["cat", 2],
    ["dan", 4],
  ]);
});

describe("last week's crown", () => {
  it("covers the Monday-to-Monday week before this one", () => {
    // Saturday 31 Oct 2026: this week began Mon 26 Oct, so last week is 19 to 26 Oct.
    expect(lastWeek(at("2026-10-31T23:00:00Z"))).toEqual({
      start: at("2026-10-19T00:00:00Z"),
      end: at("2026-10-26T00:00:00Z"),
    });
    // Just after midnight on Monday the crown passes to the week that just ended.
    expect(lastWeek(at("2026-11-02T00:00:01Z"))).toEqual({
      start: at("2026-10-26T00:00:00Z"),
      end: at("2026-11-02T00:00:00Z"),
    });
  });

  it("crowns the top scorer and skips a week nobody scored", () => {
    expect(
      champions([
        { username: "amy", value: 30 },
        { username: "bob", value: 12 },
      ]).map((r) => r.username),
    ).toEqual(["amy"]);
    expect(champions([{ username: "amy", value: 0 }])).toEqual([]);
    expect(champions([])).toEqual([]);
  });

  const tied = [
    { username: "cat", value: 20, lastAt: 100 },
    { username: "amy", value: 20, lastAt: 200 },
    { username: "bob", value: 3, lastAt: 50 },
  ];

  it("on a tie, crowns whoever got there first", () => {
    expect(champions(tied, "first").map((r) => r.username)).toEqual(["cat"]);
  });

  it("or shares it, if ties are set to share", () => {
    expect(champions(tied, "share").map((r) => r.username)).toEqual(["amy", "cat"]);
  });
});
