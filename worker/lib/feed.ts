// One query for every list of check-ins: the feed, a snack's reviews and a
// person's profile. Each row comes back with its sliders, photo and points.

import type { FeedItem } from "../../shared/types";
import { blockedEitherWay } from "./blocks";

export type { FeedItem };

interface Row {
  id: string;
  username: string;
  avatar_id: string | null;
  snack_id: string;
  snack_name: string;
  snack_brand: string | null;
  category_id: string;
  snack_status: string;
  overall: number;
  review: string | null;
  venue_text: string | null;
  paired_with: string | null;
  attrs: string;
  photo_id: string | null;
  photo_pending: number;
  points: number;
  created_at: number;
}

export interface FeedFilter {
  viewerId: string;
  snackId?: string;
  userId?: string;
  // Cursor for the next page: the last item's createdAt and id.
  before?: { createdAt: number; id: string };
  limit?: number;
}

export async function listCheckins(db: D1Database, f: FeedFilter): Promise<FeedItem[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, u.username, u.avatar_id, s.id AS snack_id, s.name AS snack_name, s.brand AS snack_brand,
              s.category_id, s.status AS snack_status, c.overall, c.review, c.venue_text, c.paired_with,
              c.created_at,
              (SELECT json_group_object(attribute, value) FROM checkin_attributes WHERE checkin_id = c.id) AS attrs,
              p.id AS photo_id,
              EXISTS (SELECT 1 FROM photos pp WHERE pp.checkin_id = c.id AND pp.status = 'pending' AND c.user_id = ?1) AS photo_pending,
              (SELECT COALESCE(SUM(points), 0) FROM points_ledger WHERE checkin_id = c.id) AS points
         FROM checkins c
         JOIN users u ON u.id = c.user_id
         JOIN snacks s ON s.id = c.snack_id
         -- A photo shows only once it's approved, even to the person who took it;
         -- they get a "waiting for approval" note instead (photo_pending).
         LEFT JOIN photos p ON p.checkin_id = c.id AND p.status = 'visible'
        WHERE (u.is_private = 0 OR u.id = ?1)
          -- Nothing from people you've blocked, or who've blocked you.
          AND NOT ${blockedEitherWay("?1", "c.user_id")}
          AND (?2 IS NULL OR c.snack_id = ?2)
          AND (?3 IS NULL OR c.user_id = ?3)
          AND (?4 IS NULL OR c.created_at < ?4 OR (c.created_at = ?4 AND c.id < ?5))
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT ?6`,
    )
    .bind(
      f.viewerId,
      f.snackId ?? null,
      f.userId ?? null,
      f.before?.createdAt ?? null,
      f.before?.id ?? null,
      Math.min(f.limit ?? 20, 50),
    )
    .all<Row>();

  return results.map((r) => ({
    id: r.id,
    username: r.username,
    avatarId: r.avatar_id,
    snack: { id: r.snack_id, name: r.snack_name, brand: r.snack_brand, category: r.category_id, status: r.snack_status },
    overall: r.overall,
    review: r.review,
    venue: r.venue_text,
    pairedWith: r.paired_with,
    attributes: JSON.parse(r.attrs || "{}") as Record<string, number>,
    photoId: r.photo_id,
    photoPending: r.photo_pending === 1,
    points: r.points,
    createdAt: r.created_at,
  }));
}

/** Read a "?before=<createdAt>:<id>" cursor. */
export function parseCursor(value: string | undefined): FeedFilter["before"] {
  if (!value) return undefined;
  const sep = value.indexOf(":");
  const createdAt = Number(value.slice(0, sep));
  if (sep < 1 || !Number.isInteger(createdAt)) return undefined;
  return { createdAt, id: value.slice(sep + 1) };
}

export function nextCursor(items: FeedItem[], limit: number): string | null {
  if (items.length < limit) return null;
  const last = items[items.length - 1];
  return `${last.createdAt}:${last.id}`;
}
