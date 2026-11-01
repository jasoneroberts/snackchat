import { beforeEach, describe, expect, it } from "vitest";
import {
  afterWrongPin,
  clearWrongPins,
  FORGET_SECONDS,
  LOCK_SECONDS,
  lockWait,
  MAX_WRONG,
  recordWrongPin,
  type PinFailures,
} from "../worker/lib/pinLock";
import { COMMON_PIN_ERROR, isCommonPin, newPin } from "../worker/lib/quickSignIn";
import { needsRenewal, RENEW_BELOW_DAYS, SESSION_DAYS } from "../worker/lib/session";

// Node's own modules, loaded by name so the type check (which has no Node types) skips them.
const nodeModule = (name: string) => import(name);
const { readdirSync, readFileSync } = await nodeModule("node:fs");
const { DatabaseSync } = await nodeModule("node:sqlite");

// D1 stand-in on Node's SQLite with every migration applied, so the lock SQL runs against the real table.
function fakeD1(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of (readdirSync("migrations") as string[]).sort()) sqlite.exec(readFileSync(`migrations/${file}`, "utf8"));
  const statement = (sql: string, args: unknown[] = []) => ({
    bind: (...next: unknown[]) => statement(sql, next),
    first: async () => (sqlite.prepare(sql).get(...(args as never[])) as Record<string, unknown> | undefined) ?? null,
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...(args as never[])).changes) } }),
  });
  return { prepare: (sql: string) => statement(sql) } as unknown as D1Database;
}

const T0 = 1_800_000_000;

/** Wrong PINs one after another, a second apart, from `start`. */
function wrongs(n: number, start = T0, from: PinFailures | null = null) {
  let s = from;
  for (let i = 0; i < n; i++) s = afterWrongPin(s, start + i);
  return s!;
}

describe("afterWrongPin", () => {
  it("counts up to MAX_WRONG - 1 without locking", () => {
    const s = wrongs(MAX_WRONG - 1);
    expect(s).toMatchObject({ wrong: MAX_WRONG - 1, strikes: 0, lockedUntil: 0 });
  });

  it("locks for 15 minutes, then 1 hour, then 24 hours", () => {
    const first = wrongs(MAX_WRONG);
    expect(first.wrong).toBe(0);
    expect(first.lockedUntil - first.updatedAt).toBe(LOCK_SECONDS[0]);
    const second = wrongs(MAX_WRONG, first.lockedUntil + 1, first);
    expect(second.lockedUntil - second.updatedAt).toBe(60 * 60);
    const third = wrongs(MAX_WRONG, second.lockedUntil + 1, second);
    expect(third.lockedUntil - third.updatedAt).toBe(24 * 60 * 60);
    const fourth = wrongs(MAX_WRONG, third.lockedUntil - FORGET_SECONDS + 100, third);
    expect(fourth.lockedUntil - fourth.updatedAt).toBe(24 * 60 * 60);
  });

  it("forgets everything after a quiet day", () => {
    const locked = wrongs(MAX_WRONG);
    const later = afterWrongPin(locked, locked.updatedAt + FORGET_SECONDS + 1);
    expect(later).toMatchObject({ wrong: 1, strikes: 0, lockedUntil: 0 });
  });
});

describe("recordWrongPin (the SQL)", () => {
  let db: D1Database;
  beforeEach(async () => {
    db = fakeD1();
    await db
      .prepare("INSERT INTO users (id, username, email, created_at) VALUES ('u1', 'sam_k', 'sam_k@quick.snackchat.invalid', 0)")
      .run();
  });

  it("does exactly what afterWrongPin does, try after try", async () => {
    // A mix of quick tries, a wait past each lock, and a quiet day.
    const times: number[] = [];
    let t = T0;
    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < MAX_WRONG; i++) times.push(t++);
      t += LOCK_SECONDS[Math.min(round, LOCK_SECONDS.length - 1)] + 1;
    }
    times.push(t + FORGET_SECONDS + 5);
    let expected: PinFailures | null = null;
    for (const at of times) {
      expected = afterWrongPin(expected, at);
      expect(await recordWrongPin(db, "u1", at)).toEqual(expected);
    }
  });

  it("is cleared by a right PIN, and goes when the person does", async () => {
    await recordWrongPin(db, "u1", T0);
    await clearWrongPins(db, "u1");
    expect(await recordWrongPin(db, "u1", T0 + 1)).toMatchObject({ wrong: 1 });
    await db.prepare("DELETE FROM users WHERE id = 'u1'").run();
    expect(await db.prepare("SELECT COUNT(*) AS n FROM pin_failures").first()).toEqual({ n: 0 });
  });
});

describe("lockWait", () => {
  it("rounds up to minutes, then hours", () => {
    expect(lockWait(T0 + 15 * 60, T0)).toBe("15 minutes");
    expect(lockWait(T0 + 30, T0)).toBe("1 minute");
    expect(lockWait(T0 + 60 * 60, T0)).toBe("1 hour");
    expect(lockWait(T0 + 23 * 60 * 60 + 1, T0)).toBe("24 hours");
  });
});

describe("isCommonPin", () => {
  it("catches repeats, straight runs and the well-known ones", () => {
    for (const pin of ["0000", "1111", "777777", "1234", "4321", "0123", "23456789", "9876", "1212", "6969", "2580", "123123"]) {
      expect(isCommonPin(pin), pin).toBe(true);
    }
  });
  it("lets ordinary PINs through", () => {
    for (const pin of ["4821", "1357924", "3091", "1235", "8520", "2024"]) expect(isCommonPin(pin), pin).toBe(false);
  });
  it("has a message", () => expect(COMMON_PIN_ERROR).toMatch(/Pick another/));
  it("is never handed out by an admin reset", () => {
    for (let i = 0; i < 300; i++) expect(isCommonPin(newPin())).toBe(false);
  });
});

describe("needsRenewal", () => {
  const day = 24 * 60 * 60;
  it("renews old 30-day sessions straight away, and new ones after a month", () => {
    expect(needsRenewal(T0 + 30 * day, T0)).toBe(true);
    expect(needsRenewal(T0 + SESSION_DAYS * day, T0)).toBe(false);
    expect(needsRenewal(T0 + (RENEW_BELOW_DAYS + 1) * day, T0)).toBe(false);
    expect(needsRenewal(T0 + (RENEW_BELOW_DAYS - 1) * day, T0)).toBe(true);
  });
});
