// "X joined Crunchd" lines for the feed. They aren't stored anywhere: a
// person's join is just their users.created_at. The feed asks for the joins
// that fall in the same stretch of time as its page of check-ins, and the
// app slots them in by time (src/lib/feedMix.ts).

import type { FeedItem, JoinedItem } from "../../shared/types";
import { blockedEitherWay } from "./blocks";

/** Never more than this many join lines with one page, even after a rush of sign-ups. */
export const MAX_JOINS = 50;

/**
 * The time window a page of check-ins covers, so joins land on the same page
 * as the check-ins either side of them.
 *  - newer than: the cursor's time (the previous page already showed anything
 *    at or after it). On the first page there's no upper limit.
 *  - at or older than: the last check-in on this page. If this is the last
 *    page (no more check-ins), there's no lower limit, so every older join shows.
 */
export function joinWindow(
  before: { createdAt: number } | undefined,
  items: FeedItem[],
  hasMore: boolean,
): { below: number | null; from: number | null } {
  return {
    below: before?.createdAt ?? null,
    from: hasMore && items.length > 0 ? items[items.length - 1].createdAt : null,
  };
}

/**
 * Joins in the window, newest first. Only people with public profiles
 * (and you), and nobody blocked either way, the same rules as check-ins.
 */
export async function listJoins(
  db: D1Database,
  viewerId: string,
  window: { below: number | null; from: number | null },
): Promise<JoinedItem[]> {
  const { results } = await db
    .prepare(
      `SELECT u.username, u.avatar_id, u.created_at,
              (SELECT COUNT(*) FROM welcome_likes w
                WHERE w.member_id = u.id AND NOT ${blockedEitherWay("?1", "w.user_id")}) AS likes,
              EXISTS (SELECT 1 FROM welcome_likes w WHERE w.member_id = u.id AND w.user_id = ?1) AS liked
         FROM users u
        WHERE (u.is_private = 0 OR u.id = ?1)
          AND NOT ${blockedEitherWay("?1", "u.id")}
          AND (?2 IS NULL OR u.created_at < ?2)
          AND (?3 IS NULL OR u.created_at >= ?3)
        ORDER BY u.created_at DESC, u.id DESC
        LIMIT ?4`,
    )
    .bind(viewerId, window.below, window.from, MAX_JOINS)
    .all<{ username: string; avatar_id: string | null; created_at: number; likes: number; liked: number }>();
  return results.map((r) => ({
    username: r.username,
    avatarId: r.avatar_id,
    joinedAt: r.created_at,
    likes: r.likes,
    liked: r.liked === 1,
  }));
}

/** The member's id if the viewer can see their join line, otherwise null. */
export async function visibleMember(db: D1Database, viewerId: string, username: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT u.id FROM users u
        WHERE u.username = ?2 AND (u.is_private = 0 OR u.id = ?1) AND NOT ${blockedEitherWay("?1", "u.id")}`,
    )
    .bind(viewerId, username)
    .first<{ id: string }>();
  return row?.id ?? null;
}

/** The like count after a change, counted the same way as the feed. */
export const welcomeLikeCount = (db: D1Database, viewerId: string, memberId: string) =>
  db
    .prepare(
      `SELECT COUNT(*) AS n FROM welcome_likes w WHERE w.member_id = ?2 AND NOT ${blockedEitherWay("?1", "w.user_id")}`,
    )
    .bind(viewerId, memberId)
    .first<number>("n");
