// "Weekly round-up instead" (Settings > Notifications).
//
// Some people like a buzz for every heart and every squad check-in; others
// find that a lot and would rather turn notifications off altogether. This
// is the middle way: people who switch on users.weekly_digest stop getting
// like and squad pushes as they happen (likeAlerts.ts and squadAlerts.ts skip
// them) and instead get ONE push on Sunday morning saying what they missed:
//
//   "Your week on Crunchd"
//   "8 likes from Sam, Dave and 3 others. Your squads logged 12 snacks; best
//    was Sam's Wotsits at 5★."
//
// Nothing is queued up during the week. Likes and check-ins are already in
// the database with their times, so on Sunday we just count what landed since
// the last round-up. That means turning the round-up on or off mid-week never
// loses or doubles anything.
//
// The same rules as the live pushes apply: the like and squad switches still
// say which half of the round-up you want, blocked people never count, a
// private poster's check-ins don't count (the squad feed hides them too),
// demo bots never count, and you're never told about your own activity.
// A quiet week sends nothing at all.

import type { Env } from "../env";
import { blockedEitherWay } from "./blocks";
import { pushToUser } from "./notify";
import { stars } from "./squadAlerts";

const DAY = 86400;
/** Sunday (getUTCDay() === 0) at 10:00 UTC: 10am in winter, 11am in summer in the UK. */
export const DIGEST_DAY_UTC = 0;
export const DIGEST_HOUR_UTC = 10;
/** A round-up never looks back further than this, even if the last one was long ago. */
export const DIGEST_WINDOW = 7 * DAY;
/** Don't send a second round-up within this long of the last (guards against the cron firing twice). */
const RESEND_GAP = 6 * DAY;

export interface DigestSummary {
  likes: number;
  /** Up to two names of people who liked your check-ins, most hearts first. */
  likers: string[];
  /** How many different people liked them (for "and 3 others"). */
  likerCount: number;
  squadCheckins: number;
  /** The best-rated squad check-in of the week, if any. */
  best: { poster: string; snack: string; overall: number } | null;
}

/** "Sam", "Sam and Dave", "Sam, Dave and 3 others". */
function names(list: string[], total: number): string {
  const rest = total - list.length;
  if (rest <= 0) return list.length === 2 ? `${list[0]} and ${list[1]}` : (list[0] ?? "");
  return `${list.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`;
}

/** The push text, in the reader's own voice. null when there's nothing to say. */
export function digestMessage(voice: string | null, s: DigestSummary): { title: string; body: string } | null {
  const parts: string[] = [];
  const lad = voice === "lad";
  if (s.likes > 0) {
    const n = `${s.likes} ${s.likes === 1 ? (lad ? "heart" : "like") : lad ? "hearts" : "likes"}`;
    parts.push(`${n} from ${names(s.likers, s.likerCount)}.`);
  }
  if (s.squadCheckins > 0) {
    const n = `${s.squadCheckins} ${s.squadCheckins === 1 ? "snack" : "snacks"}`;
    const best = s.best ? `; best was ${s.best.poster}'s ${s.best.snack} at ${stars(s.best.overall)}★` : "";
    parts.push(lad ? `The squad put away ${n}${best}.` : `Your squads logged ${n}${best}.`);
  }
  if (!parts.length) return null;
  return { title: lad ? "Your week on Crunchd, lad" : "Your week on Crunchd", body: parts.join(" ") };
}

/**
 * What happened for `userId` between `since` and `until` (seconds). `likes`
 * and `squads` say which halves they want (their like and squad switches).
 */
export async function digestFor(
  db: D1Database,
  userId: string,
  since: number,
  until: number,
  want: { likes: boolean; squads: boolean },
): Promise<DigestSummary> {
  const summary: DigestSummary = { likes: 0, likers: [], likerCount: 0, squadCheckins: 0, best: null };

  if (want.likes) {
    // ?1 = owner. One row per person who hearted any of the owner's check-ins
    // this week, with how many hearts they gave, busiest first.
    const { results } = await db
      .prepare(
        `SELECT l.username AS name, COUNT(*) AS n
           FROM likes k
           JOIN checkins c ON c.id = k.checkin_id
           JOIN users l ON l.id = k.user_id
          WHERE c.user_id = ?1 AND k.user_id != ?1 AND l.id NOT LIKE 'demo-%'
            AND k.created_at > ?2 AND k.created_at <= ?3
            AND NOT ${blockedEitherWay("?1", "k.user_id")}
          GROUP BY l.id
          ORDER BY n DESC, l.username`,
      )
      .bind(userId, since, until)
      .all<{ name: string; n: number }>();
    summary.likes = results.reduce((sum, r) => sum + r.n, 0);
    summary.likerCount = results.length;
    summary.likers = results.slice(0, 2).map((r) => r.name);
  }

  if (want.squads) {
    // ?1 = reader. Check-ins this week by anyone sharing a squad with them.
    // The squad join is inside EXISTS so someone in two of your squads isn't
    // counted twice.
    const squadCheckins = `
      FROM checkins c
      JOIN users p ON p.id = c.user_id
      JOIN snacks s ON s.id = c.snack_id
     WHERE c.user_id != ?1 AND p.is_private = 0 AND p.id NOT LIKE 'demo-%'
       AND c.created_at > ?2 AND c.created_at <= ?3
       AND EXISTS (SELECT 1 FROM group_members mine JOIN group_members theirs ON theirs.group_id = mine.group_id
                    WHERE mine.user_id = ?1 AND theirs.user_id = c.user_id)
       AND NOT ${blockedEitherWay("?1", "c.user_id")}`;
    summary.squadCheckins =
      (await db.prepare(`SELECT COUNT(*) AS n ${squadCheckins}`).bind(userId, since, until).first<number>("n")) ?? 0;
    if (summary.squadCheckins > 0) {
      summary.best = await db
        .prepare(`SELECT p.username AS poster, s.name AS snack, c.overall ${squadCheckins} ORDER BY c.overall DESC, c.created_at DESC LIMIT 1`)
        .bind(userId, since, until)
        .first<{ poster: string; snack: string; overall: number }>();
    }
  }

  return summary;
}

interface DigestReader {
  id: string;
  voice: string | null;
  like_alerts: number;
  squad_alerts: number;
  digest_sent_at: number | null;
}

/**
 * Send this week's round-ups. Called by the hourly cron at DIGEST_HOUR_UTC on
 * DIGEST_DAY_UTC. Returns how many people were sent one.
 */
export async function sendWeeklyDigests(env: Env, origin: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.voice, u.like_alerts, u.squad_alerts, u.digest_sent_at FROM users u
      WHERE u.weekly_digest = 1 AND (u.like_alerts = 1 OR u.squad_alerts = 1) AND u.id NOT LIKE 'demo-%'
        AND (u.digest_sent_at IS NULL OR u.digest_sent_at <= ?1 - ${RESEND_GAP})
        AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)`,
  )
    .bind(nowSeconds)
    .all<DigestReader>();

  let sent = 0;
  for (const u of results) {
    // From the last round-up, but never more than a week back.
    const since = Math.max(u.digest_sent_at ?? 0, nowSeconds - DIGEST_WINDOW);
    const summary = await digestFor(env.DB, u.id, since, nowSeconds, { likes: u.like_alerts === 1, squads: u.squad_alerts === 1 });
    const message = digestMessage(u.voice, summary);
    // Mark it done even on a quiet week, so next week starts from here.
    await env.DB.prepare("UPDATE users SET digest_sent_at = ? WHERE id = ?").bind(nowSeconds, u.id).run();
    if (!message) continue;
    // Likes are the personal bit, so open your profile if there were any, else the feed.
    const url = summary.likes > 0 ? "/me" : "/";
    if (await pushToUser(env, origin, u.id, { kind: "digest", url, ...message })) sent++;
  }
  return sent;
}
