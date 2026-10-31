import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifySquads, SESSION_GAP, squadMessage, stars } from "../worker/lib/squadAlerts";

// Record pushes instead of sending them.
const pushed: { to: string; title: string; body: string; url: string; tag?: string }[] = [];
vi.mock("../worker/lib/notify", () => ({
  pushToUser: async (_env: unknown, _origin: string, to: string, e: { title: string; body: string; url: string; tag?: string }) => {
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
const addUser = async (id: string, opts: { phone?: boolean; voice?: string } = {}) => {
  await run("INSERT INTO users (id, username, email, created_at, voice) VALUES (?, ?, ?, ?, ?)", id, id, `${id}@x.invalid`, T, opts.voice ?? null);
  if (opts.phone !== false) await run("INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, 'k', 'a', ?)", `https://push/${id}`, id, T);
};
const addSquad = async (id: string, name: string, members: string[]) => {
  await run("INSERT INTO groups (id, name, invite_code, created_by, created_at) VALUES (?, ?, ?, ?, ?)", id, name, `code-${id}`, members[0], T);
  for (const m of members) await run("INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)", id, m, T);
};
const checkIn = async (checkinId: string, posterId: string, time: number) => {
  const snack = await db.prepare("SELECT id FROM snacks LIMIT 1").first<string>("id");
  await run("INSERT INTO checkins (id, user_id, snack_id, overall, created_at) VALUES (?, ?, ?, 4.5, ?)", checkinId, posterId, snack, time);
  return notifySquads(env(), "https://x", { checkinId, posterId, posterName: posterId, snack: "Wotsits", overall: 4.5, time });
};

beforeEach(async () => {
  db = fakeD1();
  pushed.length = 0;
  for (const id of ["sam", "dave", "amy", "zoe"]) await addUser(id);
  await addUser("nophone", { phone: false });
  await addSquad("g1", "Roberts", ["sam", "dave", "amy", "nophone"]);
  await addSquad("g2", "Five-a-side", ["sam", "dave"]);
});

describe("squad messages", () => {
  it("shows the rating without trailing zeros", () => {
    expect([stars(4), stars(4.5), stars(3.75)]).toEqual(["4", "4.5", "3.75"]);
  });

  it("has grown-up and lad words", () => {
    expect(squadMessage("grownup", "sam", "Wotsits", 4.5, "Roberts")).toEqual({ title: "sam just checked in", body: "sam rated Wotsits 4.5★ in Roberts." });
    expect(squadMessage("lad", "dave", "Scampi Fries", 5, "Lads")).toEqual({ title: "dave's on the Scampi Fries", body: "dave gave Scampi Fries 5 in Lads. Your round?" });
  });
});

describe("telling the squad", () => {
  it("buzzes each squad mate once, never the poster or people without a phone or squad", async () => {
    await checkIn("c1", "sam", T);
    expect(pushed.map((p) => p.to).sort()).toEqual(["amy", "dave"]);
    // dave shares two squads with sam: one push, naming the first alphabetically.
    const dave = pushed.find((p) => p.to === "dave")!;
    expect(dave.body).toContain("in Five-a-side");
    expect(dave.url).toBe("/groups/g2");
    expect(dave.tag).toBe("squad-sam");
  });

  it("only buzzes for the first check-in of a session", async () => {
    await checkIn("c1", "sam", T);
    await checkIn("c2", "sam", T + 10 * 60);
    expect(pushed).toHaveLength(2);
    await checkIn("c3", "sam", T + 10 * 60 + SESSION_GAP + 1);
    expect(pushed).toHaveLength(4);
  });

  it("respects the Settings switch, blocks and private profiles", async () => {
    await run("UPDATE users SET squad_alerts = 0 WHERE id = 'amy'");
    await run("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES ('sam', 'dave', ?)", T);
    expect(await checkIn("c1", "sam", T)).toBe(0);

    await run("DELETE FROM blocks");
    await run("UPDATE users SET is_private = 1 WHERE id = 'sam'");
    expect(await checkIn("c2", "sam", T + 2 * SESSION_GAP)).toBe(0);
    expect(pushed).toHaveLength(0);
  });
});
