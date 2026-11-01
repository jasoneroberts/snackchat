// "Someone welcomed you" push messages: when someone likes your
// "joined Crunchd" line in the feed (lib/joins.ts), you get a push, unless:
//   - either of you has blocked the other,
//   - you turned like pushes off in Settings (users.like_alerts = 0; a
//     welcome is a like on your join, so it shares that switch),
//   - we've already told you about this person welcoming you
//     (welcome_notices), so unlike, like again only buzzes once.
// All welcome pushes share one tag, so a flurry of them leaves one
// notification that keeps being replaced by the newest.

import type { Env } from "../env";
import { blockedEitherWay } from "./blocks";
import { pushToUser } from "./notify";

/** The push text, in the new member's own voice. `others` is how many other people have welcomed them. */
export function welcomeMessage(voice: string | null, liker: string, others: number): { title: string; body: string } {
  const who = others <= 0 ? liker : `${liker} and ${others} ${others === 1 ? "other" : "others"}`;
  if (voice === "lad") {
    return { title: `${liker} says welcome, legend`, body: `${who} gave you a heart for joining Crunchd. Get your first one logged.` };
  }
  return { title: `${liker} welcomed you to Crunchd`, body: `${who} liked that you joined Crunchd.` };
}

/**
 * Tell `memberId` that `likerId` just liked their join. Call it only when a
 * new like row went in. Never throws: a failed push mustn't break the like.
 * Returns how many phones took it (0 when skipped).
 */
export async function notifyWelcome(env: Env, origin: string, memberId: string, likerId: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<number> {
  try {
    const db = env.DB;
    // ?1 = new member, ?2 = liker. One row only if there's someone to tell.
    const target = await db
      .prepare(
        `SELECT m.voice, l.username AS liker
           FROM users m JOIN users l ON l.id = ?2
          WHERE m.id = ?1 AND m.id != ?2 AND m.like_alerts = 1 AND m.id NOT LIKE 'demo-%'
            AND NOT ${blockedEitherWay("m.id", "?2")}
            AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = m.id)`,
      )
      .bind(memberId, likerId)
      .first<{ voice: string | null; liker: string }>();
    if (!target) return 0;

    const fresh = await db
      .prepare("INSERT OR IGNORE INTO welcome_notices (member_id, liker_id, created_at) VALUES (?, ?, ?)")
      .bind(memberId, likerId, nowSeconds)
      .run();
    if (!fresh.meta.changes) return 0;

    // Other welcomes, not counting the liker or anyone the member can't see.
    const others =
      (await db
        .prepare(
          `SELECT COUNT(*) AS n FROM welcome_likes w
            WHERE w.member_id = ?1 AND w.user_id != ?2 AND NOT ${blockedEitherWay("?1", "w.user_id")}`,
        )
        .bind(memberId, likerId)
        .first<number>("n")) ?? 0;

    return await pushToUser(env, origin, memberId, { kind: "welcome", url: "/", ...welcomeMessage(target.voice, target.liker, others) });
  } catch (err) {
    console.error("[push] notifyWelcome failed", err);
    return 0;
  }
}
