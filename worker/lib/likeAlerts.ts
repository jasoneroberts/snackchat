// "Someone liked your check-in" push messages.
//
// When someone hearts a check-in, its owner gets a push, unless:
//   - it's their own check-in (no telling you about your own heart),
//   - either of them has blocked the other,
//   - the owner turned these off in Settings (users.like_alerts = 0),
//   - the owner asked for a weekly round-up instead (users.weekly_digest = 1;
//     the like is counted in their Sunday push, see weeklyDigest.ts),
//   - we've already told the owner about this person liking this check-in.
//     like_notices remembers that, so unlike, like, unlike, like only ever
//     buzzes once.
//
// All like pushes share one tag ("like"), so a busy evening leaves a single
// notification on the phone that keeps getting replaced by the newest one,
// rather than a stack of them. "and 2 others" says how many more hearts the
// check-in has.

import type { Env } from "../env";
import { blockedEitherWay } from "./blocks";
import { pushToUser } from "./notify";

/** The push text, in the owner's own voice. `others` is how many other people have liked it too. */
export function likeMessage(voice: string | null, liker: string, snack: string, others: number): { title: string; body: string } {
  const who = others <= 0 ? liker : `${liker} and ${others} ${others === 1 ? "other" : "others"}`;
  if (voice === "lad") {
    return { title: `${liker} rates your ${snack}`, body: `${who} gave your ${snack} check-in a heart. Get another one logged.` };
  }
  return { title: `${liker} liked your check-in`, body: `${who} liked your ${snack} check-in.` };
}

interface LikeTarget {
  owner_id: string;
  voice: string | null;
  snack: string;
  liker: string;
}

/**
 * Tell a check-in's owner that `likerId` just liked it. Call it only when a
 * new like row went in. Never throws: a failed push mustn't break the like.
 * Returns how many phones took it (0 when skipped).
 */
export async function notifyLike(env: Env, origin: string, checkinId: string, likerId: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<number> {
  try {
    const db = env.DB;
    // ?1 = check-in, ?2 = liker. One row only if there's someone to tell.
    const target = await db
      .prepare(
        `SELECT o.id AS owner_id, o.voice, s.name AS snack, l.username AS liker
           FROM checkins c
           JOIN users o ON o.id = c.user_id
           JOIN snacks s ON s.id = c.snack_id
           JOIN users l ON l.id = ?2
          WHERE c.id = ?1 AND o.id != ?2 AND o.like_alerts = 1 AND o.weekly_digest = 0 AND o.id NOT LIKE 'demo-%'
            AND NOT ${blockedEitherWay("o.id", "?2")}
            AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = o.id)`,
      )
      .bind(checkinId, likerId)
      .first<LikeTarget>();
    if (!target) return 0;

    // Only the first time this person likes this check-in. If the row was
    // already there, changes is 0 and we stay quiet.
    const fresh = await db
      .prepare("INSERT OR IGNORE INTO like_notices (checkin_id, liker_id, created_at) VALUES (?, ?, ?)")
      .bind(checkinId, likerId, nowSeconds)
      .run();
    if (!fresh.meta.changes) return 0;

    // Other hearts on it, not counting the liker, the owner, or anyone the owner can't see.
    const others =
      (await db
        .prepare(
          `SELECT COUNT(*) AS n FROM likes k
            WHERE k.checkin_id = ?1 AND k.user_id NOT IN (?2, ?3) AND NOT ${blockedEitherWay("?3", "k.user_id")}`,
        )
        .bind(checkinId, likerId, target.owner_id)
        .first<number>("n")) ?? 0;

    return await pushToUser(env, origin, target.owner_id, {
      kind: "like",
      url: "/me",
      ...likeMessage(target.voice, target.liker, target.snack, others),
    });
  } catch (err) {
    console.error("[push] notifyLike failed", err);
    return 0;
  }
}
