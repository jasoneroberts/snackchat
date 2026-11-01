// Stops PIN guessing. A 4-digit PIN has only 10,000 possibilities, and the
// per-IP limit alone doesn't stop someone spreading guesses over many
// addresses. So each name gets MAX_WRONG wrong PINs, then is locked. Each
// lock lasts longer than the one before (LOCK_SECONDS), so a patient script
// gets a few dozen guesses a day instead of hundreds.
//
// The counts live in D1 (table pin_failures), not KV: D1 adds one in a single
// statement, so twenty tries sent at once are all counted, and every
// Cloudflare location sees the same number straight away.
//
// A right PIN removes the row. So does a quiet day: after FORGET_SECONDS with
// no wrong PIN, the next one starts from scratch.

export const MAX_WRONG = 10;
/** 15 minutes, then 1 hour, then 24 hours for every lock after that. */
export const LOCK_SECONDS = [15 * 60, 60 * 60, 24 * 60 * 60] as const;
export const FORGET_SECONDS = 24 * 60 * 60;

export interface PinFailures {
  wrong: number;
  strikes: number;
  lockedUntil: number;
  updatedAt: number;
}

/** "15 minutes", "1 hour", "3 hours": how long until a lock ends, rounded up. */
export function lockWait(lockedUntil: number, now: number): string {
  const minutes = Math.max(1, Math.ceil((lockedUntil - now) / 60));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * The rule, as plain code (the SQL in recordWrongPin does the same in one
 * step; the tests check this one, and that the two agree).
 */
export function afterWrongPin(prev: PinFailures | null, now: number): PinFailures {
  const fresh = !prev || prev.updatedAt < now - FORGET_SECONDS;
  const wrong = fresh ? 1 : prev.wrong + 1;
  const strikes = fresh ? 0 : prev.strikes;
  const lockedUntil = fresh ? 0 : prev.lockedUntil;
  if (wrong < MAX_WRONG) return { wrong, strikes, lockedUntil, updatedAt: now };
  const lock = LOCK_SECONDS[Math.min(strikes, LOCK_SECONDS.length - 1)];
  return { wrong: 0, strikes: strikes + 1, lockedUntil: now + lock, updatedAt: now };
}

// One statement, so it can't be split by tries arriving together. In an
// UPDATE, SQLite reads every column's old value, so "wrong" on the right of
// each line is the count before this try.
const RECORD_SQL = `
INSERT INTO pin_failures (user_id, wrong, strikes, locked_until, updated_at) VALUES (?1, 1, 0, 0, ?2)
ON CONFLICT (user_id) DO UPDATE SET
  strikes = CASE WHEN updated_at < ?2 - ${FORGET_SECONDS} THEN 0
                 WHEN wrong + 1 >= ${MAX_WRONG} THEN strikes + 1
                 ELSE strikes END,
  locked_until = CASE WHEN updated_at < ?2 - ${FORGET_SECONDS} THEN 0
                      WHEN wrong + 1 >= ${MAX_WRONG} THEN ?2 + CASE MIN(strikes, ${LOCK_SECONDS.length - 1})
                        ${LOCK_SECONDS.map((s, i) => `WHEN ${i} THEN ${s}`).join(" ")} END
                      ELSE locked_until END,
  wrong = CASE WHEN updated_at < ?2 - ${FORGET_SECONDS} THEN 1
               WHEN wrong + 1 >= ${MAX_WRONG} THEN 0
               ELSE wrong + 1 END,
  updated_at = ?2
RETURNING wrong, strikes, locked_until AS lockedUntil, updated_at AS updatedAt`;

/** Count a wrong PIN, and lock the name if that was one too many. */
export async function recordWrongPin(db: D1Database, userId: string, now: number): Promise<PinFailures> {
  const row = await db.prepare(RECORD_SQL).bind(userId, now).first<PinFailures>();
  return row ?? { wrong: 1, strikes: 0, lockedUntil: 0, updatedAt: now };
}

export const clearWrongPins = (db: D1Database, userId: string) =>
  db.prepare("DELETE FROM pin_failures WHERE user_id = ?").bind(userId).run();

export { RECORD_SQL as RECORD_WRONG_PIN_SQL };
