import { beforeEach, describe, expect, it, vi } from "vitest";
import { digestFor, digestMessage, DIGEST_WINDOW, sendWeeklyDigests } from "../worker/lib/weeklyDigest";
import { notifyLike } from "../worker/lib/likeAlerts";
import { notifySquads } from "../worker/lib/squadAlerts";

// Record pushes instead of sending them.
const pushed: { to: string; kind: string; title: string; body: string; url: string }[] = [];
vi.mock("../worker/lib/notify", () => ({
  pushToUser: async (_env: unknown, _origin: string, to: string, e: { kind: string; title: string; body: string; url: string }) => {
    pushed.push({ to, ...e });
    return 1;
  },
}));

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
const env = () => ({ DB: db }) as never;
const run = (sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args).run();
const addUser = async (id: string, opts: { digest?: boolean; voice?: string; private?: boolean } = {}) => {
  await run(
    "INSERT INTO users (id, username, email, created_at, voice, weekly_digest, is_private) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id, id, `${id}@x.invalid`, T, opts.voice ?? null, opts.digest ? 1 : 0, opts.private ? 1 : 0,
  );
  await run("INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, 'k', 'a', ?)", `https://push/${id}`, id, T);
};
let snackId = "";
const checkIn = (id: string, user: string, time: number, overall = 4) =>
  run("INSERT INTO checkins (id, user_id, snack_id, overall, created_at) VALUES (?, ?, ?, ?, ?)", id, user, snackId, overall, time);
const like = (checkin: string, user: string, time: number) =>
  run("INSERT INTO likes (checkin_id, user_id, created_at) VALUES (?, ?, ?)", checkin, user, time);

const NOW = T + 30 * 86400;

beforeEach(async () => {
  db = fakeD1();
  pushed.length = 0;
  snackId = (await db.prepare("SELECT id FROM snacks LIMIT 1").first<string>("id"))!;
  await addUser("jase", { digest: true });
  for (const id of ["sam", "dave", "amy"]) await addUser(id);
  await run("INSERT INTO groups (id, name, invite_code, created_by, created_at) VALUES ('g1', 'Roberts', 'c1', 'jase', ?)", T);
  await run("INSERT INTO groups (id, name, invite_code, created_by, created_at) VALUES ('g2', 'Pub', 'c2', 'jase', ?)", T);
  for (const m of ["jase", "sam", "dave"]) await run("INSERT INTO group_members (group_id, user_id, joined_at) VALUES ('g1', ?, ?)", m, T);
  for (const m of ["jase", "sam"]) await run("INSERT INTO group_members (group_id, user_id, joined_at) VALUES ('g2', ?, ?)", m, T);
});

describe("weekly round-up", () => {
  it("counts the week's likes and squad check-ins", async () => {
    await checkIn("mine", "jase", NOW - 3 * 86400);
    await checkIn("mine2", "jase", NOW - 2 * 86400);
    await like("mine", "sam", NOW - 86400);
    await like("mine2", "sam", NOW - 86400);
    await like("mine", "dave", NOW - 86400);
    await like("mine", "amy", NOW - 86400);
    await like("mine", "jase", NOW - 86400); // your own heart doesn't count
    await checkIn("s1", "sam", NOW - 86400, 3);
    await checkIn("s2", "dave", NOW - 3600, 5);
    await checkIn("old", "sam", NOW - DIGEST_WINDOW - 60, 5); // last week
    await checkIn("a1", "amy", NOW - 3600, 5); // not in a squad with jase

    const s = await digestFor(db, "jase", NOW - DIGEST_WINDOW, NOW, { likes: true, squads: true });
    expect(s.likes).toBe(4);
    expect(s.likerCount).toBe(3);
    expect(s.likers).toEqual(["sam", "amy"]);
    // Sam is in two of Jase's squads but his check-in counts once.
    expect(s.squadCheckins).toBe(2);
    expect(s.best).toEqual({ poster: "dave", snack: expect.any(String), overall: 5 });
  });

  it("leaves out blocked and private people, and the half you switched off", async () => {
    await checkIn("mine", "jase", NOW - 3 * 86400);
    await like("mine", "sam", NOW - 86400);
    await run("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES ('jase', 'sam', ?)", T);
    await run("UPDATE users SET is_private = 1 WHERE id = 'dave'");
    await checkIn("s1", "sam", NOW - 86400);
    await checkIn("d1", "dave", NOW - 86400);
    const s = await digestFor(db, "jase", NOW - DIGEST_WINDOW, NOW, { likes: true, squads: true });
    expect(s.likes).toBe(0);
    expect(s.squadCheckins).toBe(0);
    await run("DELETE FROM blocks");
    const likesOnly = await digestFor(db, "jase", NOW - DIGEST_WINDOW, NOW, { likes: true, squads: false });
    expect(likesOnly.likes).toBe(1);
    expect(likesOnly.squadCheckins).toBe(0);
  });

  it("sends one push, only to people who asked, and not twice", async () => {
    await checkIn("mine", "jase", NOW - 3 * 86400);
    await like("mine", "sam", NOW - 86400);
    await checkIn("s1", "sam", NOW - 86400, 4.5);
    await checkIn("j1", "jase", NOW - 86400, 4.5); // so Sam (no round-up) would have something too

    expect(await sendWeeklyDigests(env(), "https://x", NOW)).toBe(1);
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ to: "jase", kind: "digest", url: "/me", title: "Your week on Crunchd" });
    expect(pushed[0].body).toContain("1 like from sam.");
    expect(pushed[0].body).toContain("Your squads logged 1 snack; best was sam's");

    // The cron firing again the same day sends nothing.
    expect(await sendWeeklyDigests(env(), "https://x", NOW + 60)).toBe(0);
    // Next week only counts what's new since this one.
    await like("mine", "dave", NOW + 86400);
    pushed.length = 0;
    expect(await sendWeeklyDigests(env(), "https://x", NOW + 7 * 86400)).toBe(1);
    expect(pushed[0].body).toBe("1 like from dave.");
  });

  it("says nothing on a quiet week", async () => {
    expect(await sendWeeklyDigests(env(), "https://x", NOW)).toBe(0);
    expect(pushed).toHaveLength(0);
  });

  it("stops the live like and squad pushes for people on the round-up", async () => {
    await checkIn("mine", "jase", NOW - 60);
    await like("mine", "sam", NOW);
    expect(await notifyLike(env(), "https://x", "mine", "sam", NOW)).toBe(0);
    await checkIn("s1", "sam", NOW);
    await notifySquads(env(), "https://x", { checkinId: "s1", posterId: "sam", posterName: "sam", snack: "Wotsits", overall: 4, time: NOW });
    expect(pushed.map((p) => p.to)).toEqual(["dave"]); // Dave still hears live; Jase waits for Sunday
  });
});

describe("round-up words", () => {
  const base = { likes: 0, likers: [], likerCount: 0, squadCheckins: 0, best: null };
  it("names up to two people and counts the rest", () => {
    expect(digestMessage(null, { ...base, likes: 9, likers: ["Sam", "Dave"], likerCount: 5 })!.body).toBe("9 likes from Sam, Dave and 3 others.");
    expect(digestMessage(null, { ...base, likes: 2, likers: ["Sam", "Dave"], likerCount: 2 })!.body).toBe("2 likes from Sam and Dave.");
  });
  it("has lad words", () => {
    const m = digestMessage("lad", { ...base, squadCheckins: 3, best: { poster: "Sam", snack: "Wotsits", overall: 4.5 } })!;
    expect(m.body).toBe("The squad put away 3 snacks; best was Sam's Wotsits at 4.5★.");
  });
  it("is null when nothing happened", () => {
    expect(digestMessage(null, base)).toBeNull();
  });
});
