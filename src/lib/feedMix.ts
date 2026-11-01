// The feed shows check-ins and "joined Crunchd" lines in one list, newest
// first. The server sends them as two lists for the same stretch of time
// (worker/lib/joins.ts); this puts them in order.

import type { FeedItem, JoinedItem } from "../../shared/types";

export type FeedEntry = { kind: "checkin"; item: FeedItem } | { kind: "joined"; item: JoinedItem };

const time = (e: FeedEntry) => (e.kind === "checkin" ? e.item.createdAt : e.item.joinedAt);

/**
 * Newest first. On a tie the check-in goes above the join, since you have to
 * join before you can check in.
 */
export function mixFeed(checkins: FeedItem[], joins: JoinedItem[]): FeedEntry[] {
  const entries: FeedEntry[] = [
    ...checkins.map((item) => ({ kind: "checkin" as const, item })),
    ...joins.map((item) => ({ kind: "joined" as const, item })),
  ];
  // Array sort is stable, so check-ins keep the server's order among themselves.
  return entries.sort((a, b) => time(b) - time(a) || (a.kind === b.kind ? 0 : a.kind === "checkin" ? -1 : 1));
}
