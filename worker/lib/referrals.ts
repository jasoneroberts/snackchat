// Friend invites. Everyone has a personal link (getcrunchd.com/?ref=friend&by=jase).
// When someone makes an account from it, the inviter gets INVITE_POINTS.join;
// when that friend checks in for the first time, the inviter gets
// INVITE_POINTS.firstCheckin more. The two-step reward is the main guard
// against fake accounts: the bigger bonus needs a real check-in.
//
// Other guards:
// - Each bonus is paid for at most INVITE_POINTS.friendsPerDay friends per
//   inviter per UTC day. Friends past that still count as theirs, for 0 points.
// - You can't invite yourself: the new account can't be the inviter, demo
//   people can't invite, and the app drops a link from a name that has
//   already signed in on the same phone (src/lib/ref.ts).
// - The points go in points_ledger with no check-in. Boards only count
//   points joined to check-ins, plus invitePointsSql() below while
//   INVITE_POINTS.onBoards is on. Turning it off takes them off every table
//   at once and leaves them on your total.

import { BAG_POINTS } from "../../shared/bag";
import { INVITE_POINTS } from "../../shared/ref";
import type { InviteStats } from "../../shared/types";
import type { Env } from "../env";
import { pushToUser } from "./notify";

const dayStart = (time: number) => time - (time % 86400);

/**
 * Called straight after a new account is made. Links the friend to the
 * inviter and pays the join bonus (if under the day's cap). Never throws:
 * a broken invite mustn't stop someone joining.
 * Returns the inviter's id and the points paid, or null if nothing was recorded.
 */
export async function recordReferral(
  db: D1Database,
  opts: { friendId: string; inviter: string | null; time: number },
): Promise<{ inviterId: string; points: number } | null> {
  if (!opts.inviter) return null;
  try {
    const inviter = await db
      .prepare("SELECT id FROM users WHERE username = ? AND id != ? AND id NOT LIKE 'demo-%'")
      .bind(opts.inviter, opts.friendId)
      .first<{ id: string }>();
    if (!inviter) return null;

    // One batch is one transaction: the cap check, the row and the points
    // either all happen or none do. The CASE pays 0 once the inviter has had
    // friendsPerDay paid joins today.
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO referrals (friend_id, inviter_id, joined_at, join_points)
           VALUES (?1, ?2, ?3,
             CASE WHEN (SELECT COUNT(*) FROM referrals
                         WHERE inviter_id = ?2 AND joined_at >= ?4 AND join_points > 0) < ?5
                  THEN ?6 ELSE 0 END)`,
        )
        .bind(opts.friendId, inviter.id, opts.time, dayStart(opts.time), INVITE_POINTS.friendsPerDay, INVITE_POINTS.join),
      db
        .prepare(
          `INSERT INTO points_ledger (user_id, checkin_id, reason, points, created_at)
           SELECT inviter_id, NULL, 'invite_join', join_points, ?2 FROM referrals
            WHERE friend_id = ?1 AND join_points > 0`,
        )
        .bind(opts.friendId, opts.time),
    ]);
    const row = await db
      .prepare("SELECT join_points FROM referrals WHERE friend_id = ?")
      .bind(opts.friendId)
      .first<{ join_points: number }>();
    return { inviterId: inviter.id, points: row?.join_points ?? 0 };
  } catch (err) {
    console.error("[invite] recordReferral failed", err);
    return null;
  }
}

/**
 * Statements to add to a check-in's batch. They do nothing unless this is
 * the first check-in of someone who joined from an invite. The UPDATE marks
 * the referral with this check-in's id (only ever once, thanks to
 * "first_checkin_id IS NULL"), then the INSERT pays the inviter whatever the
 * UPDATE decided, found by that same id, so a double tap can't pay twice.
 */
export function firstCheckinBonus(db: D1Database, opts: { friendId: string; checkinId: string; time: number }): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE referrals SET first_checkin_id = ?2, checked_in_at = ?3,
                checkin_points = CASE WHEN (SELECT COUNT(*) FROM referrals r
                                             WHERE r.inviter_id = referrals.inviter_id
                                               AND r.checked_in_at >= ?4 AND r.checkin_points > 0) < ?5
                                      THEN ?6 ELSE 0 END
          WHERE friend_id = ?1 AND first_checkin_id IS NULL`,
      )
      .bind(opts.friendId, opts.checkinId, opts.time, dayStart(opts.time), INVITE_POINTS.friendsPerDay, INVITE_POINTS.firstCheckin),
    db
      .prepare(
        `INSERT INTO points_ledger (user_id, checkin_id, reason, points, created_at)
         SELECT inviter_id, NULL, 'invite_checkin', checkin_points, ?2 FROM referrals
          WHERE first_checkin_id = ?1 AND checkin_points > 0`,
      )
      .bind(opts.checkinId, opts.time),
  ];
}

/** After a check-in: if it just paid an inviter, tell them. Never throws. */
export async function tellInviterAboutCheckin(env: Env, origin: string, opts: { checkinId: string; friendName: string }): Promise<void> {
  try {
    const row = await env.DB.prepare("SELECT inviter_id, checkin_points FROM referrals WHERE first_checkin_id = ?")
      .bind(opts.checkinId)
      .first<{ inviter_id: string; checkin_points: number }>();
    if (!row) return;
    await pushToUser(env, origin, row.inviter_id, {
      kind: "invite",
      title: row.checkin_points > 0 ? `+${row.checkin_points} pts` : "First check-in",
      body: `${opts.friendName} just did their first check-in. Thanks for bringing them!`,
      url: "/me",
    });
  } catch (err) {
    console.error("[invite] tellInviterAboutCheckin failed", err);
  }
}

/** After a sign-up from an invite: tell the inviter. Never throws (pushToUser doesn't). */
export function tellInviterAboutJoin(env: Env, origin: string, opts: { inviterId: string; points: number; friendName: string }) {
  return pushToUser(env, origin, opts.inviterId, {
    kind: "invite",
    title: opts.points > 0 ? `+${opts.points} pts` : "A friend joined",
    body: `${opts.friendName} joined Crunchd from your invite. You'll get ${INVITE_POINTS.firstCheckin} more when they check in.`,
    url: "/me",
  });
}

/**
 * SQL to add to a board's points sum: the invite points (and bag tips) `userCol` earned
 * since the bind parameter `since`. They count whatever snack types the
 * board or squad covers, since they aren't for a snack. Empty when
 * INVITE_POINTS.onBoards is off.
 */
export function invitePointsSql(userCol: string, since: string, until?: string): string {
  // Bag tips (lib/bagTips.ts) are the same kind of points: earned for
  // someone else's check-in, so they ride along here under their own switch.
  const reasons = [
    ...(INVITE_POINTS.onBoards ? ["'invite_join'", "'invite_checkin'"] : []),
    ...(BAG_POINTS.onBoards ? ["'bag_tip'"] : []),
  ];
  if (!reasons.length) return "";
  const before = until ? ` AND (${until} IS NULL OR ip.created_at < ${until})` : "";
  return ` + (SELECT COALESCE(SUM(ip.points), 0) FROM points_ledger ip
               WHERE ip.user_id = ${userCol} AND ip.checkin_id IS NULL
                 AND ip.reason IN (${reasons.join(", ")}) AND ip.created_at >= ${since}${before})`;
}

/** Your invite numbers, for the card on your profile. */
export async function inviteStats(db: D1Database, userId: string): Promise<InviteStats> {
  const { results } = await db
    .prepare(
      `SELECT u.username, u.avatar_id AS avatarId, r.checked_in_at IS NOT NULL AS checkedIn,
              r.join_points + r.checkin_points AS points
         FROM referrals r JOIN users u ON u.id = r.friend_id
        WHERE r.inviter_id = ?
        ORDER BY r.joined_at DESC`,
    )
    .bind(userId)
    .all<{ username: string; avatarId: string | null; checkedIn: number; points: number }>();
  const friends = results.map((f) => ({ ...f, checkedIn: f.checkedIn === 1 }));
  return {
    friends,
    joined: friends.length,
    checkedIn: friends.filter((f) => f.checkedIn).length,
    points: friends.reduce((sum, f) => sum + f.points, 0),
  };
}
