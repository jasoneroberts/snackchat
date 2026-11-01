import { beforeEach, describe, expect, it } from "vitest";
import { joinWindow, listJoins } from "../worker/lib/joins";
import { mixFeed } from "../src/lib/feedMix";
import type { FeedItem, JoinedItem } from "../shared/types";

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

let db: D1Database;
const run = (sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args).run();
const addUser = (id: string, at: number, isPrivate = 0) =>
  run("INSERT INTO users (id, username, email, is_private, created_at) VALUES (?, ?, ?, ?, ?)", id, id, `${id}@x.invalid`, isPrivate, at);
const checkin = (id: string, createdAt: number) => ({ id, createdAt }) as FeedItem;
const joined = (username: string, joinedAt: number) => ({ username, joinedAt }) as JoinedItem;

beforeEach(async () => {
  db = fakeD1();
  await addUser("me", 100);
  await addUser("ann", 200);
  await addUser("bob", 300);
  await addUser("shy", 400, 1);
  await addUser("rude", 500);
  await run("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES ('rude', 'me', 1)");
});

describe("join lines in the feed", () => {
  it("show everyone public, past members included, newest first", async () => {
    const all = await listJoins(db, "me", { below: null, from: null });
    expect(all.map((j) => j.username)).toEqual(["bob", "ann", "me"]); // not private shy, not rude who blocked me
  });

  it("you see your own even when your profile is private", async () => {
    const all = await listJoins(db, "shy", { below: null, from: null });
    expect(all.map((j) => j.username)).toContain("shy");
  });

  it("only take the page's stretch of time, so nothing shows twice", async () => {
    // Page one ends at a check-in from 250; page two starts below that.
    const one = await listJoins(db, "me", joinWindow(undefined, [checkin("a", 900), checkin("b", 250)], true));
    const two = await listJoins(db, "me", joinWindow({ createdAt: 250 }, [checkin("c", 150)], false));
    expect(one.map((j) => j.username)).toEqual(["bob"]);
    expect(two.map((j) => j.username)).toEqual(["ann", "me"]); // last page: everything older too
  });

  it("count likes and whether you liked it", async () => {
    await run("INSERT INTO welcome_likes (member_id, user_id, created_at) VALUES ('bob', 'me', 1), ('bob', 'ann', 1), ('bob', 'rude', 1)");
    const [bob] = await listJoins(db, "me", { below: null, from: 250 });
    expect(bob).toMatchObject({ username: "bob", likes: 2, liked: true }); // rude's like hidden from me
  });

  it("mix in by time, check-in above a join in the same second", () => {
    const out = mixFeed([checkin("x", 300), checkin("y", 100)], [joined("ann", 200), joined("bob", 300)]);
    expect(out.map((e) => (e.kind === "checkin" ? e.item.id : e.item.username))).toEqual(["x", "bob", "ann", "y"]);
  });
});
