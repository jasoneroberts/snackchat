import { beforeEach, describe, expect, it } from "vitest";
import { cleanInviter, INVITE_POINTS } from "../shared/ref";
import { firstCheckinBonus, inviteStats, recordReferral } from "../worker/lib/referrals";
import { validateQuickSignIn } from "../worker/lib/quickSignIn";

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
const addUser = (id: string, username: string) =>
  db
    .prepare("INSERT INTO users (id, username, email, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, username, `${id}@x.invalid`, T)
    .run();
const pointsOf = async (id: string) =>
  (await db.prepare("SELECT COALESCE(SUM(points), 0) AS n FROM points_ledger WHERE user_id = ?").bind(id).first<number>("n")) ?? 0;
const checkIn = async (userId: string, checkinId: string, time: number) => {
  const snack = await db.prepare("SELECT id FROM snacks LIMIT 1").first<string>("id");
  await db.batch([
    db
      .prepare("INSERT INTO checkins (id, user_id, snack_id, overall, created_at) VALUES (?, ?, ?, 4, ?)")
      .bind(checkinId, userId, snack, time),
    ...firstCheckinBonus(db, { friendId: userId, checkinId, time }),
  ]);
};

beforeEach(async () => {
  db = fakeD1();
  await addUser("jase", "Jase");
});

describe("invite links", () => {
  it("only accepts things that could be usernames", () => {
    expect(cleanInviter(" jase ")).toBe("jase");
    expect(cleanInviter("ja")).toBeNull();
    expect(cleanInviter("jase'; drop")).toBeNull();
    expect(cleanInviter(null)).toBeNull();
    expect(validateQuickSignIn({ username: "sam_k", pin: "1234", invitedBy: "Jase" })).toMatchObject({ value: { inviter: "Jase" } });
  });

  it("pays the inviter when a friend joins, and more on their first check-in only", async () => {
    await addUser("sam", "sam");
    // Usernames match whatever the case, like sign-in.
    expect(await recordReferral(db, { friendId: "sam", inviter: "jase", time: T })).toEqual({ inviterId: "jase", points: INVITE_POINTS.join });
    expect(await pointsOf("jase")).toBe(INVITE_POINTS.join);

    await checkIn("sam", "c1", T + 60);
    expect(await pointsOf("jase")).toBe(INVITE_POINTS.join + INVITE_POINTS.firstCheckin);
    await checkIn("sam", "c2", T + 60); // same second, second check-in: no more
    expect(await pointsOf("jase")).toBe(INVITE_POINTS.join + INVITE_POINTS.firstCheckin);

    const stats = await inviteStats(db, "jase");
    expect(stats).toMatchObject({ joined: 1, checkedIn: 1, points: INVITE_POINTS.join + INVITE_POINTS.firstCheckin });
    expect(stats.friends[0]).toMatchObject({ username: "sam", checkedIn: true });
  });

  it("keeps invite points off the boards (no check-in attached)", async () => {
    await addUser("sam", "sam");
    await recordReferral(db, { friendId: "sam", inviter: "jase", time: T });
    await checkIn("sam", "c1", T + 60);
    const onBoards = await db
      .prepare("SELECT COUNT(*) AS n FROM points_ledger WHERE user_id = 'jase' AND checkin_id IS NOT NULL")
      .first<number>("n");
    expect(onBoards).toBe(0);
  });

  it("ignores unknown names, demo people and yourself", async () => {
    await addUser("sam", "sam");
    await addUser("demo-bot", "crispbot");
    expect(await recordReferral(db, { friendId: "sam", inviter: "nobody", time: T })).toBeNull();
    expect(await recordReferral(db, { friendId: "sam", inviter: "crispbot", time: T })).toBeNull();
    expect(await recordReferral(db, { friendId: "sam", inviter: "sam", time: T })).toBeNull();
    expect(await recordReferral(db, { friendId: "sam", inviter: null, time: T })).toBeNull();
    await checkIn("sam", "c1", T + 60); // not invited: nothing happens
    expect(await pointsOf("jase")).toBe(0);
  });

  it("pays each bonus for at most friendsPerDay friends a day", async () => {
    const n = INVITE_POINTS.friendsPerDay + 2;
    for (let i = 0; i < n; i++) {
      await addUser(`f${i}`, `friend${i}`);
      await recordReferral(db, { friendId: `f${i}`, inviter: "jase", time: T + i });
      await checkIn(`f${i}`, `c${i}`, T + 100 + i);
    }
    const capped = INVITE_POINTS.friendsPerDay * (INVITE_POINTS.join + INVITE_POINTS.firstCheckin);
    expect(await pointsOf("jase")).toBe(capped);
    // Everyone still counts as yours; the extras just paid nothing.
    expect((await inviteStats(db, "jase")).joined).toBe(n);

    // Tomorrow the cap starts again.
    await addUser("next", "nextday");
    await recordReferral(db, { friendId: "next", inviter: "jase", time: T + DAY });
    expect(await pointsOf("jase")).toBe(capped + INVITE_POINTS.join);
  });

  it("forgets the link when the friend deletes their account, but the inviter keeps the points", async () => {
    await addUser("sam", "sam");
    await recordReferral(db, { friendId: "sam", inviter: "jase", time: T });
    await db.prepare("DELETE FROM users WHERE id = 'sam'").run();
    expect((await inviteStats(db, "jase")).joined).toBe(0);
    expect(await pointsOf("jase")).toBe(INVITE_POINTS.join);
  });
});
