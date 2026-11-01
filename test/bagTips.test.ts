import { beforeEach, describe, expect, it } from "vitest";
import { BAG_POINTS } from "../shared/bag";
import { bagFromCheckin, bagTipStatements, tipFor, tipMessage, unbagFromCheckin } from "../worker/lib/bagTips";
import { listCheckins } from "../worker/lib/feed";
import { progressFor } from "../worker/lib/achievements";
import { invitePointsSql } from "../worker/lib/referrals";

// Node's own modules, loaded by name so the type check (which has no Node types) skips them.
const nodeModule = (name: string) => import(name);
const { readdirSync, readFileSync } = await nodeModule("node:fs");
const { DatabaseSync } = await nodeModule("node:sqlite");

// A tiny stand-in for Cloudflare D1 on top of Node's built-in SQLite, with
// every migration applied, so the invite SQL runs against the real schema.
function fakeD1(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of (readdirSync("migrations") as string[]).sort()) sqlite.exec(readFileSync(`migrations/${file}`, "utf8"));

  const statement = (sql: string, args: unknown[] = []) => ({
    sql,
    args,
    bind: (...next: unknown[]) => statement(sql, next),
    first: async (col?: string) => {
      const row = sqlite.prepare(sql).get(...(args as never[])) as Record<string, unknown> | undefined;
      return row ? (col ? row[col] : row) : null;
    },
    all: async () => ({ results: sqlite.prepare(sql).all(...(args as never[])) }),
    run: async () => {
      const r = sqlite.prepare(sql).run(...(args as never[]));
      return { meta: { changes: Number(r.changes) } };
    },
  });
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (list: ReturnType<typeof statement>[]) => {
      sqlite.exec("BEGIN");
      try {
        const out = list.map((s) => sqlite.prepare(s.sql).run(...(s.args as never[])));
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
const T = 20_000 * DAY + 3600; // 01:00 on some day

let db: D1Database;
let snacks: string[];
const addUser = (id: string, username: string) =>
  db.prepare("INSERT INTO users (id, username, email, created_at) VALUES (?, ?, ?, ?)").bind(id, username, `${id}@x.invalid`, T).run();
const pointsOf = async (id: string) =>
  (await db.prepare("SELECT COALESCE(SUM(points), 0) AS n FROM points_ledger WHERE user_id = ?").bind(id).first<number>("n")) ?? 0;
/** A check-in the way the route does it: the row, then the tip statements, in one batch. */
const checkIn = (userId: string, checkinId: string, snackId: string, time = T) =>
  db.batch([
    db.prepare("INSERT INTO checkins (id, user_id, snack_id, overall, created_at) VALUES (?, ?, ?, 4, ?)").bind(checkinId, userId, snackId, time),
    ...bagTipStatements(db, { userId, snackId, checkinId, time }),
  ]);

beforeEach(async () => {
  db = fakeD1();
  await addUser("jase", "Jase");
  await addUser("sam", "sam");
  const { results } = await db.prepare("SELECT id FROM snacks WHERE status = 'approved' ORDER BY id LIMIT 20").all<{ id: string }>();
  snacks = results.map((r) => r.id);
});

describe("bag it from a check-in", () => {
  it("pays the person whose check-in you bagged it from, on your first check-in only", async () => {
    await checkIn("jase", "j1", snacks[0]);
    expect(await bagFromCheckin(db, "sam", "j1", T + 10)).toEqual({ ok: true, snackId: snacks[0], tipper: "Jase" });

    await checkIn("sam", "s1", snacks[0], T + 60);
    expect(await pointsOf("jase")).toBe(BAG_POINTS.tried);
    expect(await tipFor(db, "s1")).toEqual({ username: "Jase", points: BAG_POINTS.tried });

    // A second go at the same snack pays nothing more...
    await checkIn("sam", "s2", snacks[0], T + 120);
    expect(await pointsOf("jase")).toBe(BAG_POINTS.tried);
    // ...and neither does deleting both and logging it again.
    await db.prepare("DELETE FROM checkins WHERE user_id = 'sam'").run();
    await bagFromCheckin(db, "sam", "j1", T + 130);
    await checkIn("sam", "s3", snacks[0], T + 140);
    expect(await pointsOf("jase")).toBe(BAG_POINTS.tried);
    // The tip points sit apart from check-ins, so they never touch Jase's daily cap.
    expect(await db.prepare("SELECT checkin_id FROM points_ledger WHERE user_id = 'jase' AND reason = 'bag_tip'").first("checkin_id")).toBeNull();
  });

  it("won't bag your own check-in, a snack you've tried, or a check-in you can't see", async () => {
    await checkIn("jase", "j1", snacks[0]);
    expect(await bagFromCheckin(db, "jase", "j1", T)).toMatchObject({ ok: false, status: 400 });
    await checkIn("sam", "s1", snacks[0]);
    expect(await bagFromCheckin(db, "sam", "j1", T)).toMatchObject({ ok: false, status: 400 });
    expect(await bagFromCheckin(db, "sam", "nope", T)).toMatchObject({ ok: false, status: 404 });
    await addUser("ann", "ann");
    await db.prepare("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES ('jase', 'ann', 1)").run();
    expect(await bagFromCheckin(db, "ann", "j1", T)).toMatchObject({ ok: false, status: 404 });
  });

  it("pays nothing for snacks bagged from Explore, un-bagged ones or demo people", async () => {
    // Saved from Explore: no check-in to thank.
    await db.prepare("INSERT INTO explore_choices (user_id, snack_id, choice, created_at) VALUES ('sam', ?, 'saved', ?)").bind(snacks[0], T).run();
    await checkIn("sam", "s1", snacks[0], T + 60);
    // Bagged then un-bagged.
    await checkIn("jase", "j2", snacks[1]);
    await bagFromCheckin(db, "sam", "j2", T);
    await unbagFromCheckin(db, "sam", "j2");
    await checkIn("sam", "s2", snacks[1], T + 60);
    // A demo person's check-in.
    await addUser("demo-bot", "crispbot");
    await checkIn("demo-bot", "d1", snacks[2]);
    await bagFromCheckin(db, "sam", "d1", T);
    await checkIn("sam", "s3", snacks[2], T + 60);
    expect(await pointsOf("jase")).toBe(0);
    expect(await pointsOf("demo-bot")).toBe(0);
  });

  it("keeps the credit with whoever put you onto it first", async () => {
    await addUser("ann", "ann");
    await checkIn("jase", "j1", snacks[0]);
    await checkIn("ann", "a1", snacks[0]);
    await bagFromCheckin(db, "sam", "j1", T);
    await bagFromCheckin(db, "sam", "a1", T + 5);
    await checkIn("sam", "s1", snacks[0], T + 60);
    expect(await pointsOf("jase")).toBe(BAG_POINTS.tried);
    expect(await pointsOf("ann")).toBe(0);
  });

  it("pays for at most perDay tries a day, but every try counts towards the chieves", async () => {
    const n = BAG_POINTS.perDay + 2;
    for (let i = 0; i < n; i++) {
      await checkIn("jase", `j${i}`, snacks[i]);
      await bagFromCheckin(db, "sam", `j${i}`, T);
      await checkIn("sam", `s${i}`, snacks[i], T + 100 + i);
    }
    expect(await pointsOf("jase")).toBe(BAG_POINTS.perDay * BAG_POINTS.tried);
    expect((await progressFor(db, "jase", T + DAY)).counts.tips).toBe(n);

    // Tomorrow the cap starts again.
    await checkIn("jase", "jx", snacks[n]);
    await bagFromCheckin(db, "sam", "jx", T + DAY);
    await checkIn("sam", "sx", snacks[n], T + DAY + 10);
    expect(await pointsOf("jase")).toBe((BAG_POINTS.perDay + 1) * BAG_POINTS.tried);
  });

  it("counts tip points on the boards while onBoards is on", async () => {
    await checkIn("jase", "j1", snacks[0]);
    await bagFromCheckin(db, "sam", "j1", T);
    await checkIn("sam", "s1", snacks[0], T + 60);
    const board = await db.prepare(`SELECT 0${invitePointsSql("u.id", "?1")} AS n FROM users u WHERE u.id = 'jase'`).bind(T).first<number>("n");
    expect(board).toBe(BAG_POINTS.onBoards ? BAG_POINTS.tried : 0);
  });

  it("shows bagged, tried and the counts on feed cards", async () => {
    await checkIn("jase", "j1", snacks[0]);
    await bagFromCheckin(db, "sam", "j1", T);
    const [forSam] = await listCheckins(db, { viewerId: "sam", userId: "jase" });
    expect(forSam).toMatchObject({ bagged: true, tried: false, bags: 0, tries: 0 });
    await checkIn("sam", "s1", snacks[0], T + 60);
    const [forJase] = await listCheckins(db, { viewerId: "jase", userId: "jase" });
    expect(forJase).toMatchObject({ tried: true, bags: 1, tries: 1 });
  });

  it("words the push in the tipper's voice", () => {
    expect(tipMessage(null, "sam", "Quavers", 10)).toEqual({ title: "+10 pts", body: "sam tried Quavers after bagging it from your check-in." });
    expect(tipMessage("lad", "sam", "Quavers", 0).title).toBe("You've got taste");
  });
});
