// "Someone in your squad just checked in" push messages.
//
// When someone posts a check-in, everyone who shares a squad with them gets
// a push, unless:
//   - it's the poster themselves,
//   - either of them has blocked the other,
//   - the poster's profile is private (the squad feed hides their check-ins
//     too, so a push would point at something you can't see),
//   - the squad mate turned these off in Settings (users.squad_alerts = 0),
//   - the poster already checked in within the last SESSION_GAP seconds.
//     Someone working through a sharing bag of six snacks buzzes your phone
//     once, for the first one, not six times. The rest are in the feed.
//
// You get one push per check-in however many squads you share with the
// poster. The push names one of them (the first alphabetically) and opens it.
//
// Each poster has their own tag ("squad-<id>"), so if two of Sam's sessions
// land before you look, the newer one replaces the older on your phone,
// while Sam and Dave still show as separate notifications.

import type { Env } from "../env";
import { blockedEitherWay } from "./blocks";
import { pushToUser } from "./notify";

/** A check-in this soon after the poster's previous one doesn't buzz anyone. */
export const SESSION_GAP = 30 * 60;

/** Never push to more people than this for one check-in (keeps the Worker well inside its request budget). */
export const MAX_RECIPIENTS = 40;

/** 4 → "4", 4.5 → "4.5", 3.75 → "3.75". */
export function stars(overall: number): string {
  return String(Number(overall.toFixed(2)));
}

/** The push text, in the reader's own voice (lad or grown-up). */
export function squadMessage(
  voice: string | null,
  poster: string,
  snack: string,
  overall: number,
  squad: string,
): { title: string; body: string } {
  if (voice === "lad") {
    return { title: `${poster}'s on the ${snack}`, body: `${poster} gave ${snack} ${stars(overall)} in ${squad}. Your round?` };
  }
  return { title: `${poster} just checked in`, body: `${poster} rated ${snack} ${stars(overall)}★ in ${squad}.` };
}

interface Recipient {
  user_id: string;
  voice: string | null;
  group_id: string;
  squad: string;
}

/**
 * Tell `posterId`'s squad mates about check-in `checkinId`. Call it once,
 * straight after the check-in is saved. Never throws: a failed push mustn't
 * break the check-in. Returns how many phones took it (0 when skipped).
 */
export async function notifySquads(
  env: Env,
  origin: string,
  opts: { checkinId: string; posterId: string; posterName: string; snack: string; overall: number; time: number },
): Promise<number> {
  try {
    const db = env.DB;

    // Quiet if they're private, a demo bot, or already mid-session.
    const quiet = await db
      .prepare(
        `SELECT 1 FROM users u WHERE u.id = ?1 AND (u.is_private = 1 OR u.id LIKE 'demo-%'
            OR EXISTS (SELECT 1 FROM checkins c WHERE c.user_id = ?1 AND c.id != ?2 AND c.created_at > ?3 - ?4 AND c.created_at <= ?3))`,
      )
      .bind(opts.posterId, opts.checkinId, opts.time, SESSION_GAP)
      .first();
    if (quiet) return 0;

    // One row per squad mate who wants to hear and has a phone to hear it on.
    // ?1 = poster. GROUP BY r.user_id squashes several shared squads into one.
    const { results } = await db
      .prepare(
        `SELECT r.id AS user_id, r.voice, MIN(g.name) AS squad,
                (SELECT g2.id FROM groups g2 JOIN group_members m2 ON m2.group_id = g2.id
                  JOIN group_members p2 ON p2.group_id = g2.id
                  WHERE m2.user_id = r.id AND p2.user_id = ?1 ORDER BY g2.name LIMIT 1) AS group_id
           FROM group_members mine
           JOIN group_members theirs ON theirs.group_id = mine.group_id AND theirs.user_id != ?1
           JOIN groups g ON g.id = mine.group_id
           JOIN users r ON r.id = theirs.user_id
          WHERE mine.user_id = ?1
            AND r.squad_alerts = 1 AND r.id NOT LIKE 'demo-%'
            AND NOT ${blockedEitherWay("r.id", "?1")}
            AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = r.id)
          GROUP BY r.id
          LIMIT ${MAX_RECIPIENTS}`,
      )
      .bind(opts.posterId)
      .all<Recipient>();

    let sent = 0;
    for (const r of results) {
      sent += await pushToUser(env, origin, r.user_id, {
        kind: "squad",
        tag: `squad-${opts.posterId}`,
        url: `/groups/${r.group_id}`,
        ...squadMessage(r.voice, opts.posterName, opts.snack, opts.overall, r.squad),
      });
    }
    return sent;
  } catch (err) {
    console.error("[push] notifySquads failed", err);
    return 0;
  }
}
