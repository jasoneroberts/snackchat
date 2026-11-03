import { beforeEach, describe, expect, it } from "vitest";
import { mergeSnacks } from "../worker/lib/mergeSnacks";

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
        const out = list.map((s) => ({ meta: { changes: Number(sqlite.prepare(s.sql).run(...(s.args as never[])).changes) } }));
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

const addUser = (id: string) =>
  db.prepare("INSERT INTO users (id, username, email, created_at) VALUES (?, ?, ?, ?)").bind(id, id, `${id}@x.invalid`, T).run();
const addSnack = (id: string, name: string, status = "approved") =>
  db
    .prepare("INSERT INTO snacks (id, name, brand, category_id, status, created_at) VALUES (?, ?, 'Kinder', 'chocolate', ?, ?)")
    .bind(id, name, status, T)
    .run();
const checkIn = (id: string, userId: string, snackId: string) =>
  db.prepare("INSERT INTO checkins (id, user_id, snack_id, overall, created_at) VALUES (?, ?, ?, 4, ?)").bind(id, userId, snackId, T).run();
const snack = (id: string) =>
  db.prepare("SELECT status, merged_into, vegan FROM snacks WHERE id = ?").bind(id).first<{ status: string; merged_into: string | null; vegan: number | null }>();
const count = (sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args).first<number>("n");

beforeEach(async () => {
  db = fakeD1();
  await addUser("jase");
  await addUser("sam");
  await addSnack("keep", "Kinder Cards");
  await addSnack("dupe", "Kinder cards bar");
});

describe("merging duplicate snacks", () => {
  it("moves check-ins across and retires the duplicate", async () => {
    await checkIn("c1", "jase", "dupe");
    await checkIn("c2", "sam", "keep");
    const result = await mergeSnacks(db, "dupe", "keep");
    expect(result).toMatchObject({ ok: true, moved: 1 });
    expect(await count("SELECT COUNT(*) AS n FROM checkins WHERE snack_id = 'keep'")).toBe(2);
    expect(await snack("dupe")).toMatchObject({ status: "merged", merged_into: "keep" });
  });

  it("keeps one saved suggestion and one bag tip per person when both snacks had one", async () => {
    for (const id of ["keep", "dupe"]) {
      await db.prepare("INSERT INTO explore_choices (user_id, snack_id, choice, created_at) VALUES ('jase', ?, 'saved', ?)").bind(id, T).run();
    }
    await db.prepare("INSERT INTO explore_choices (user_id, snack_id, choice, created_at) VALUES ('sam', 'dupe', 'saved', ?)").bind(T).run();
    await db
      .prepare("INSERT INTO bag_tips (user_id, snack_id, tipper_id, checkin_id, created_at) VALUES ('sam', 'dupe', 'jase', 'x', ?)")
      .bind(T)
      .run();
    expect((await mergeSnacks(db, "dupe", "keep")).ok).toBe(true);
    expect(await count("SELECT COUNT(*) AS n FROM explore_choices WHERE snack_id = 'keep'")).toBe(2);
    expect(await count("SELECT COUNT(*) AS n FROM explore_choices WHERE snack_id = 'dupe'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM bag_tips WHERE snack_id = 'keep'")).toBe(1);
  });

  it("fills in what the kept snack was missing and approves it if the duplicate was approved", async () => {
    await addSnack("waiting", "Kinder cards", "pending");
    await db.prepare("UPDATE snacks SET vegan = 0 WHERE id = 'dupe'").run();
    await mergeSnacks(db, "dupe", "waiting");
    expect(await snack("waiting")).toMatchObject({ status: "approved", vegan: 0 });
  });

  it("refuses the same snack, a merged snack, or a missing one", async () => {
    expect(await mergeSnacks(db, "keep", "keep")).toMatchObject({ ok: false });
    expect(await mergeSnacks(db, "dupe", "nope")).toMatchObject({ ok: false, status: 404 });
    await mergeSnacks(db, "dupe", "keep");
    expect(await mergeSnacks(db, "dupe", "keep")).toMatchObject({ ok: false, error: "That snack was already merged." });
    await addSnack("third", "Kinder card");
    expect(await mergeSnacks(db, "third", "dupe")).toMatchObject({ ok: false });
  });
});
