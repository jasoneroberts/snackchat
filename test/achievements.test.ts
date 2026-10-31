import { beforeEach, describe, expect, it, vi } from "vitest";
import { BADGES, isEarly, isLate, percentages, streakFrom, ukHour, weekNumber, weekStartOf } from "../shared/achievements";
import { awardSecretBadge, checkAchievements, sendStreakNudges, streakMessage } from "../worker/lib/achievements";
import { battleView, castVote, ensureBattle, pickPair, repickBattle, resultMessage, sendBattleResults } from "../worker/lib/battle";
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

describe("Crisp of the Week", () => {
  const first = () => 0; // always picks the top two
  it("picks two crisps, the most checked-in first, and the same pair for everyone", async () => {
    const [a, b, c] = await crisps(3);
    await checkIn("jase", c, NOW - DAY);
    await checkIn("sam", c, NOW - DAY);
    await checkIn("sam", b, NOW - DAY);
    const battle = await ensureBattle(db, NOW, { random: first });
    expect([battle!.snack_a, battle!.snack_b]).toEqual([c, b]);
    expect(battle!.week_start).toBe(MONDAY);
    expect(await ensureBattle(db, NOW + DAY)).toEqual(battle);
    expect(a).toBeTruthy();
  });

  it("rests last few weeks' snacks", async () => {
    const lastWeek = await ensureBattle(db, NOW - 7 * DAY, { random: first });
    const pair = await pickPair(db, MONDAY, { random: first });
    expect(pair).not.toContain(lastWeek!.snack_a);
    expect(pair).not.toContain(lastWeek!.snack_b);
  });

  it("hides the count until you vote, lets you change your vote, and only for this week's two", async () => {
    const battle = (await ensureBattle(db, NOW, { random: first }))!;
    expect((await battleView(db, battle, "jase", NOW)).votes).toBeNull();
    expect(await castVote(db, "jase", "seed-scampi-fries", NOW)).toBe("Pick one of this week's two.");
    expect(await castVote(db, "jase", battle.snack_a, NOW)).toBeNull();
    expect(await castVote(db, "sam", battle.snack_a, NOW)).toBeNull();
    expect(await castVote(db, "sam", battle.snack_b, NOW)).toBeNull(); // changed their mind
    const view = await battleView(db, battle, "jase", NOW);
    expect(view).toMatchObject({ votes: { a: 1, b: 1 }, myVote: battle.snack_a });
    expect(view.a.name).toBeTruthy();
  });

  it("starts again when an admin repicks", async () => {
    const battle = (await ensureBattle(db, NOW, { random: first }))!;
    await castVote(db, "jase", battle.snack_a, NOW);
    const fresh = (await repickBattle(db, NOW, first))!;
    expect([fresh.snack_a, fresh.snack_b]).not.toContain(battle.snack_a);
    expect((await battleView(db, fresh, "jase", NOW)).myVote).toBeNull();
  });

  it("tells last week's voters who won, once, and counts Kingmaker and Swing Voter", async () => {
    const lastWeekTime = NOW - 7 * DAY;
    const battle = (await ensureBattle(db, lastWeekTime, { random: first }))!;
    await castVote(db, "jase", battle.snack_a, lastWeekTime);
    await castVote(db, "sam", battle.snack_a, lastWeekTime);
    const env = { DB: db } as unknown as Env;
    const mondayEvening = MONDAY + 18 * 3600;
    expect(await sendBattleResults(env, "https://x", mondayEvening)).toBe(2);
    expect(pushed[0].title).toMatch(/is Crisp of the Week$/);
    expect(await sendBattleResults(env, "https://x", mondayEvening)).toBe(0);
    const past = await battleView(db, battle, "nobody", NOW);
    expect(past).toMatchObject({ winner: battle.snack_a, votes: { a: 2, b: 0 } });
    const progress = (await checkAchievements(db, "jase", NOW)).page.badges;
    expect(progress.find((b) => b.id === "kingmaker")!.progress).toBe(1);
    expect(progress.find((b) => b.id === "swing_voter")!.progress).toBe(1);
  });

  it("words the result", () => {
    expect(resultMessage(null, { winner: "Wotsits", a: "Wotsits", b: "Quavers" }, { a: 64, b: 36 }).body).toBe(
      "Wotsits beat Quavers 64% to 36%. This week's battle is up. Get your vote in.",
    );
    expect(resultMessage("lad", { winner: null, a: "A", b: "B" }, { a: 50, b: 50 }).title).toContain("dead heat");
    expect(percentages(1, 2)).toEqual({ a: 33, b: 67 });
    expect(percentages(0, 0)).toEqual({ a: 0, b: 0 });
  });
});
