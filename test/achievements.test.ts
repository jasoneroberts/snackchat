import { beforeEach, describe, expect, it, vi } from "vitest";
import { BADGES, isEarly, isLate, streakFrom, ukHour, weekNumber, weekStartOf } from "../shared/achievements";
import { awardSecretBadge, awardWingItBadges, checkAchievements, sendStreakNudges, streakMessage } from "../worker/lib/achievements";
import { crowns, lastWeeksChampions } from "../worker/lib/champions";
import type { Env } from "../worker/env";

// Pushes are recorded instead of sent.
const pushed: { userId: string; title: string; kind: string }[] = [];
vi.mock("../worker/lib/notify", () => ({
  pushToUser: async (_env: unknown, _origin: string, userId: string, event: { title: string; kind: string }) => {
    pushed.push({ userId, title: event.title, kind: event.kind });
    return 1;
  },
}));

// Node's own modules, loaded by name so the type check (which has no Node types) skips them.
const nodeModule = (name: string) => import(name);
const { readdirSync, readFileSync } = await nodeModule("node:fs");
const { DatabaseSync } = await nodeModule("node:sqlite");

// Cloudflare D1 stood in for by Node's SQLite, with every migration applied.
function fakeD1(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of (readdirSync("migrations") as string[]).sort()) sqlite.exec(readFileSync(`migrations/${file}`, "utf8"));
  const run = (sql: string, args: unknown[]) => {
    const r = sqlite.prepare(sql).run(...(args as never[]));
    return { meta: { changes: Number(r.changes) } };
  };
  const statement = (sql: string, args: unknown[] = []) => ({
    sql,
    args,
    bind: (...next: unknown[]) => statement(sql, next),
    first: async (col?: string) => {
      const row = sqlite.prepare(sql).get(...(args as never[])) as Record<string, unknown> | undefined;
      return row ? (col ? row[col] : row) : null;
    },
    all: async () => ({ results: sqlite.prepare(sql).all(...(args as never[])) }),
    run: async () => run(sql, args),
  });
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (list: ReturnType<typeof statement>[]) => {
      sqlite.exec("BEGIN");
      try {
        const out = list.map((s) => run(s.sql, s.args));
        sqlite.exec("COMMIT");
        return out;
      } catch (err) {
        sqlite.exec("ROLLBACK");
        throw err;
      }
    },
  } as unknown as D1Database;
}

const DAY = 86400;
// Wednesday 2026-11-04 12:00 UTC.
const NOW = Date.UTC(2026, 10, 4, 12) / 1000;
const MONDAY = Date.UTC(2026, 10, 2) / 1000;

let db: D1Database;
let n = 0;
const addUser = (id: string) =>
  db.prepare("INSERT INTO users (id, username, email, created_at) VALUES (?, ?, ?, ?)").bind(id, id, `${id}@x.invalid`, NOW - 90 * DAY).run();
const checkIn = (userId: string, snackId: string, time: number, overall = 4, review: string | null = null) =>
  db
    .prepare("INSERT INTO checkins (id, user_id, snack_id, overall, review, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(`c${++n}`, userId, snackId, overall, review, time)
    .run();
const crisps = async (count: number) =>
  (await db.prepare("SELECT id FROM snacks WHERE category_id = 'crisps' AND status = 'approved' ORDER BY id LIMIT ?").bind(count).all<{ id: string }>()).results.map(
    (r) => r.id,
  );

beforeEach(async () => {
  db = fakeD1();
  pushed.length = 0;
  n = 0;
  await addUser("jase");
  await addUser("sam");
});

describe("weeks and streaks", () => {
  it("numbers Monday-to-Sunday weeks", () => {
    expect(weekStartOf(weekNumber(NOW))).toBe(MONDAY);
    expect(weekNumber(MONDAY)).toBe(weekNumber(MONDAY + 7 * DAY - 1));
    expect(weekNumber(MONDAY - 1)).toBe(weekNumber(MONDAY) - 1);
  });

  it("keeps a streak alive until the week after it", () => {
    const w = weekNumber(NOW);
    expect(streakFrom([w, w - 1, w - 2, w - 5], NOW)).toEqual({ current: 3, best: 3, thisWeek: true });
    // Nothing yet this week, but last week counts: still alive.
    expect(streakFrom([w - 1, w - 2], NOW)).toEqual({ current: 2, best: 2, thisWeek: false });
    // Missed last week: gone, though the best is remembered.
    expect(streakFrom([w - 2, w - 3, w - 4, w - 5], NOW)).toEqual({ current: 0, best: 4, thisWeek: false });
    expect(streakFrom([], NOW)).toEqual({ current: 0, best: 0, thisWeek: false });
  });

  it("reads the hour on a UK clock, summer time included", () => {
    expect(ukHour(Date.UTC(2026, 0, 10, 0, 30) / 1000)).toBe(0); // winter: same as UTC
    expect(ukHour(Date.UTC(2026, 6, 10, 23, 30) / 1000)).toBe(0); // summer: an hour ahead
    expect(isLate(Date.UTC(2026, 6, 10, 1) / 1000)).toBe(true); // 2am in July
    expect(isEarly(Date.UTC(2026, 6, 10, 5) / 1000)).toBe(true); // 6am in July
    expect(isEarly(Date.UTC(2026, 6, 10, 7) / 1000)).toBe(false); // 8am
  });
});

describe("badges", () => {
  it("hands out what's been earned once, and lists the rest with progress", async () => {
    await checkIn("jase", "seed-scampi-fries", Date.UTC(2026, 10, 3, 1) / 1000, 1.5); // 1am: Night Owl, and a sceptic
    const first = await checkAchievements(db, "jase", NOW);
    expect(first.newly.map((b) => b.id).sort()).toEqual(["first_crunch", "night_owl", "scampi_sceptic"]);
    const regular = first.page.badges.find((b) => b.id === "regular")!;
    expect(regular).toMatchObject({ progress: 1, goal: 10, earnedAt: null });
    // Hidden badges aren't listed until earned.
    expect(first.page.badges.some((b) => b.id === "golden_crisp")).toBe(false);
    // Looking again gives nothing new.
    expect((await checkAchievements(db, "jase", NOW)).newly).toEqual([]);
  });

  it("doesn't count check-ins marked as not scored", async () => {
    await checkIn("jase", "seed-scampi-fries", NOW);
    await db.prepare("UPDATE checkins SET scored = 0").run();
    expect((await checkAchievements(db, "jase", NOW)).newly).toEqual([]);
  });

  it("counts different crisps for Crisp Connoisseur", async () => {
    const ids = await crisps(25);
    expect(ids.length).toBe(25);
    for (const id of ids) await checkIn("jase", id, NOW - DAY);
    await checkIn("jase", ids[0], NOW - DAY); // a repeat doesn't add
    const { page } = await checkAchievements(db, "jase", NOW);
    expect(page.badges.find((b) => b.id === "crisp_connoisseur")!.earnedAt).toBe(NOW);
    expect(page.badges.find((b) => b.id === "regular")!.earnedAt).toBe(NOW);
  });

  it("gives the secret badge only through its own door, once", async () => {
    expect(await awardSecretBadge(db, "jase", "centurion", NOW)).toBeNull();
    expect(await awardSecretBadge(db, "jase", "golden_crisp", NOW)).toMatchObject({ new: true, badge: { name: "Golden Crisp" } });
    expect(await awardSecretBadge(db, "jase", "golden_crisp", NOW + 5)).toMatchObject({ new: false, badge: { earnedAt: NOW } });
    const { page } = await checkAchievements(db, "jase", NOW);
    expect(page.badges.find((b) => b.id === "golden_crisp")?.earnedAt).toBe(NOW);
  });

  it("gives Wing It score badges up to the score, once each, and only lists them once earned", async () => {
    expect(await awardWingItBadges(db, "jase", 9, NOW)).toEqual([]);
    expect((await awardWingItBadges(db, "jase", 27, NOW)).map((b) => b.id)).toEqual(["wingit_10", "wingit_25"]);
    expect((await awardWingItBadges(db, "jase", 30, NOW)).map((b) => b.id)).toEqual([]);
    expect((await awardWingItBadges(db, "jase", 50, NOW)).map((b) => b.id)).toEqual(["wingit_50"]);
    const { page, newly } = await checkAchievements(db, "sam", NOW);
    expect(page.badges.some((b) => b.id.startsWith("wingit"))).toBe(false);
    expect(newly).toEqual([]);
    const mine = (await checkAchievements(db, "jase", NOW)).page.badges.filter((b) => b.id.startsWith("wingit"));
    expect(mine.map((b) => b.earnedAt)).toEqual([NOW, NOW, NOW]);
  });

  it("has unique ids and sensible goals", () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
    expect(BADGES.every((b) => b.goal >= 1)).toBe(true);
  });
});

describe("streak nudges", () => {
  const env = () => ({ DB: db }) as unknown as Env;
  const subscribe = (userId: string) =>
    db.prepare("INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, 'k', 'a', 0)").bind(`https://p/${userId}`, userId).run();
  const SUNDAY_6PM = MONDAY + 6 * DAY + 18 * 3600;
  const snack = "seed-scampi-fries";

  it("nudges people with a 2+ week streak and nothing yet this week", async () => {
    await subscribe("jase");
    await subscribe("sam");
    await addUser("pat");
    await subscribe("pat");
    await checkIn("jase", snack, MONDAY - 3 * DAY); // last week
    await checkIn("jase", snack, MONDAY - 10 * DAY); // the week before
    await checkIn("sam", snack, MONDAY - 3 * DAY); // only one week: no nudge
    await checkIn("pat", snack, MONDAY - 3 * DAY);
    await checkIn("pat", snack, MONDAY - 10 * DAY);
    await checkIn("pat", snack, MONDAY + DAY); // already safe this week
    const nudged = await sendStreakNudges(env(), "https://x", SUNDAY_6PM);
    expect([...nudged]).toEqual(["jase"]);
    expect(pushed).toEqual([{ userId: "jase", kind: "streak", title: "Keep your 2-week streak going" }]);
  });

  it("leaves out people who turned reminders off", async () => {
    await subscribe("jase");
    await checkIn("jase", snack, MONDAY - 3 * DAY);
    await checkIn("jase", snack, MONDAY - 10 * DAY);
    await db.prepare("UPDATE users SET reminders = 0").run();
    expect((await sendStreakNudges(env(), "https://x", SUNDAY_6PM)).size).toBe(0);
  });

  it("speaks lad", () => {
    expect(streakMessage("lad", 3).body).toContain("3 weeks on the bounce");
  });
});

describe("last week's champions", () => {
  const ledger = (userId: string, checkinId: string, points: number, time: number) =>
    db.prepare("INSERT INTO points_ledger (user_id, checkin_id, reason, points, created_at) VALUES (?, ?, 'new_snack', ?, ?)").bind(userId, checkinId, points, time).run();

  it("crowns last week's top snack and top scorer, ignoring this week", async () => {
    const [a, b] = await crisps(2);
    const lastWeek = MONDAY - 3 * DAY;
    await checkIn("jase", a, lastWeek, 4); // c1
    await checkIn("sam", a, lastWeek, 4.5); // c2: a averages 4.25
    await checkIn("sam", b, lastWeek, 4); // c3
    await checkIn("sam", b, MONDAY + DAY, 5); // c4: this week, doesn't count
    await ledger("jase", "c1", 10, lastWeek);
    await ledger("sam", "c2", 10, lastWeek);
    await ledger("sam", "c3", 10, lastWeek);
    await ledger("jase", "c4", 50, MONDAY + DAY);
    const result = await lastWeeksChampions(db, NOW);
    expect(result.weekStart).toBe(MONDAY - 7 * DAY);
    expect(result.snack).toMatchObject({ id: a, avg: 4.25, count: 2 });
    expect(result.person).toMatchObject({ username: "sam", points: 20 });
  });

  it("leaves admins off, like the global Table", async () => {
    const [a] = await crisps(1);
    await checkIn("jase", a, MONDAY - DAY, 4);
    await ledger("jase", "c1", 10, MONDAY - DAY);
    await db.prepare("UPDATE users SET is_admin = 1 WHERE id = 'jase'").run();
    const result = await lastWeeksChampions(db, NOW);
    expect(result.person).toBeNull();
    expect(result.snack?.id).toBe(a); // their rating still counts for the snack
  });

  it("is empty after a quiet week", async () => {
    expect(await lastWeeksChampions(db, NOW)).toMatchObject({ snack: null, person: null });
  });
});

describe("crowns", () => {
  const ledger = (userId: string, checkinId: string, points: number, time: number) =>
    db.prepare("INSERT INTO points_ledger (user_id, checkin_id, reason, points, created_at) VALUES (?, ?, 'new_snack', ?, ?)").bind(userId, checkinId, points, time).run();
  const squad = async (id: string, members: string[], mode = "checkins") => {
    await db.prepare("INSERT INTO groups (id, name, invite_code, scoring_mode, created_by, created_at) VALUES (?, ?, ?, ?, ?, 0)").bind(id, id, id, mode, members[0]).run();
    for (const m of members) await db.prepare("INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, 0)").bind(id, m).run();
  };
  const lastWeek = MONDAY - 3 * DAY;

  it("crowns busy squads' champions, and the global winner says so", async () => {
    await addUser("pat");
    await addUser("kim");
    const [a, b] = await crisps(2);
    await squad("pub", ["sam", "pat", "kim"]);
    await checkIn("sam", a, lastWeek); // c1
    await checkIn("sam", b, lastWeek); // c2
    await checkIn("pat", a, lastWeek); // c3
    await checkIn("kim", a, lastWeek); // c4
    await ledger("pat", "c3", 50, lastWeek); // pat tops Crunchd on points
    // A squad of one can't hand out crowns.
    await squad("solo", ["jase"]);
    await checkIn("jase", a, lastWeek);
    const result = await crowns(db, NOW);
    expect(result.people).toEqual({ sam: "squad", pat: "global" });
  });

  it("needs three people scoring in a squad", async () => {
    const [a] = await crisps(1);
    await squad("duo", ["jase", "sam"]);
    await checkIn("sam", a, lastWeek);
    await checkIn("jase", a, lastWeek);
    expect((await crowns(db, NOW)).people).toEqual({});
  });

  it("settles a points tie by who got there first", async () => {
    const [a] = await crisps(1);
    await checkIn("jase", a, lastWeek + 3600); // c1, later
    await checkIn("sam", a, lastWeek); // c2, earlier
    await ledger("jase", "c1", 20, lastWeek + 3600);
    await ledger("sam", "c2", 20, lastWeek);
    expect((await lastWeeksChampions(db, NOW)).person?.username).toBe("sam");
  });

  it("crowns last week's and last month's top snacks", async () => {
    const [a, b, c] = await crisps(3);
    const october = Date.UTC(2026, 9, 10) / 1000;
    await checkIn("jase", a, october, 5); // a lone 5 ranks as 3.75 on the month
    await checkIn("jase", b, october, 4);
    await checkIn("sam", b, october, 4); // b: 4 from two people, so b wins October
    await checkIn("sam", c, lastWeek + 2 * DAY, 5); // Sunday 1 Nov: last week, not October
    expect((await crowns(db, NOW)).snacks).toEqual({ [c]: ["week"], [b]: ["month"] });
  });
});
