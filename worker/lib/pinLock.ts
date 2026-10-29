// Stops PIN guessing. A 4-digit PIN has only 10,000 possibilities, and the
// per-IP limit alone doesn't stop someone spreading guesses over many
// addresses. So each name gets MAX_WRONG wrong PINs, then is locked for
// LOCK_MINUTES. The count lives in KV, which forgets it when the time is up.
// A right PIN clears it.

export const MAX_WRONG = 10;
export const LOCK_MINUTES = 15;

const key = (userId: string) => `pinfail:${userId}`;

export async function pinLocked(kv: KVNamespace, userId: string): Promise<boolean> {
  return Number((await kv.get(key(userId))) ?? 0) >= MAX_WRONG;
}

/** Count a wrong PIN. The lock runs LOCK_MINUTES from the latest wrong try. */
export async function recordWrongPin(kv: KVNamespace, userId: string): Promise<void> {
  const wrong = Number((await kv.get(key(userId))) ?? 0) + 1;
  await kv.put(key(userId), String(wrong), { expirationTtl: LOCK_MINUTES * 60 });
}

export const clearWrongPins = (kv: KVNamespace, userId: string) => kv.delete(key(userId));
