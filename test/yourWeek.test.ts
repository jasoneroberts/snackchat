import { beforeEach, describe, expect, it } from "vitest";
import { lastWeek, yourWeek } from "../worker/lib/yourWeek";
import { names, weekLines } from "../src/lib/yourWeek";

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

const T = 1_800_000_000;
let db: D1Database;
const run = (sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args).run();
const addUser = (id: string) => run("INSERT INTO users (id, username, email, created_at) VALUES (?, ?, ?, ?)", id, id, `${id}@x.invalid`, T);
let snackId = "";
const checkIn = (id: string, user: string, time: number, overall = 4) =>
  run("INSERT INTO checkins (id, user_id, snack_id, overall, created_at) VALUES (?, ?, ?, ?, ?)", id, user, snackId, overall, time);
const like = (checkin: string, user: string, time: number) => run("INSERT INTO likes (checkin_id, user_id, created_at) VALUES (?, ?, ?)", checkin, user, time);

// A Monday at noon UTC, so last week is the seven days before this morning.
const NOW = Date.UTC(2026, 10, 2, 12) / 1000;
const { since, until } = lastWeek(NOW);
const MID = since + 3 * 86400;

beforeEach(async () => {
  db = fakeD1();
  snackId = (await db.prepare("SELECT id FROM snacks LIMIT 1").first<string>("id"))!;
  for (const id of ["jase", "sam", "dave", "amy"]) await addUser(id);
  await run("INSERT INTO groups (id, name, invite_code, created_by, created_at) VALUES ('g1', 'Roberts', 'c1', 'jase', ?)", T);
  await run("INSERT INTO groups (id, name, invite_code, created_by, created_at) VALUES ('g2', 'Pub', 'c2', 'jase', ?)", T);
  for (const m of ["jase", "sam", "dave"]) await run("INSERT INTO group_members (group_id, user_id, joined_at) VALUES ('g1', ?, ?)", m, T);
  for (const m of ["jase", "sam"]) await run("INSERT INTO group_members (group_id, user_id, joined_at) VALUES ('g2', ?, ?)", m, T);
});

describe("your week", () => {
  it("covers last Monday to this Monday", () => {
    expect(new Date(until * 1000).toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(until - since).toBe(7 * 86400);
  });

  it("counts last week's likes, your check-ins and your squads' check-ins", async () => {
    await checkIn("mine", "jase", MID);
    await checkIn("mine2", "jase", MID);
    await checkIn("now", "jase", NOW - 60); // this week, not last
    await like("mine", "sam", MID);
    await like("mine2", "sam", MID);
    await like("mine", "dave", MID);
    await like("mine", "amy", MID);
    await like("mine", "jase", MID); // your own heart doesn't count
    await like("mine2", "dave", NOW - 60); // this week
    await checkIn("s1", "sam", MID, 3);
    await checkIn("s2", "dave", MID, 5);
    await checkIn("old", "sam", since - 60, 5); // the week before
    await checkIn("a1", "amy", MID, 5); // not in a squad with jase

    const w = await yourWeek(db, "jase", since, until);
    expect(w).toMatchObject({ likes: 4, likerCount: 3, likers: ["sam", "amy"], checkins: 2, squadCheckins: 2 });
    // Sam is in two of Jase's squads but his check-in counts once; Dave's 5 is the best.
    expect(w.best).toMatchObject({ poster: "dave", overall: 5, snackId });
  });

  it("leaves out blocked and private people", async () => {
    await checkIn("mine", "jase", MID);
    await like("mine", "sam", MID);
    await checkIn("s1", "sam", MID);
    await checkIn("d1", "dave", MID);
    await run("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES ('jase', 'sam', ?)", T);
    await run("UPDATE users SET is_private = 1 WHERE id = 'dave'");
    expect(await yourWeek(db, "jase", since, until)).toMatchObject({ likes: 0, squadCheckins: 0, best: null, checkins: 1 });
  });
});

describe("your week card words", () => {
  const quiet = { likes: 0, likers: [], likerCount: 0, checkins: 0, squadCheckins: 0, best: null };
  it("names up to two people and counts the rest", () => {
    expect(names(["Sam", "Dave"], 5)).toBe("Sam, Dave and 3 others");
    expect(names(["Sam", "Dave"], 2)).toBe("Sam and Dave");
    expect(names(["Sam"], 1)).toBe("Sam");
  });
  it("writes a line for each thing that happened", () => {
    const lines = weekLines({ likes: 9, likers: ["Sam", "Dave"], likerCount: 5, checkins: 1, squadCheckins: 3, best: { poster: "Sam", snack: "Wotsits", snackId: "w", overall: 4.5 } }, false);
    expect(lines.map((l) => l.text)).toEqual([
      "9 likes from Sam, Dave and 3 others",
      "You logged 1 snack",
      "Your squads logged 3 snacks. Best: Sam's Wotsits, 4.5★",
    ]);
  });
  it("has lad words", () => {
    expect(weekLines({ ...quiet, likes: 1, likers: ["Sam"], likerCount: 1 }, true)[0].text).toBe("1 heart from Sam");
  });
  it("shows nothing on a quiet week", () => {
    expect(weekLines(quiet, false)).toEqual([]);
  });
});
