import { useState } from "react";
import type { JoinedItem } from "../../shared/types";
import { api } from "../api";
import { timeAgo } from "../lib/format";
import { Avatar } from "./Avatar";
import { Link } from "./Link";

/**
 * A thin one-line "X joined Crunchd" row in the feed, with a like on the
 * right so people can say hello. Liking works like the heart on a check-in:
 * the screen changes first, then the server is told, and it switches back if
 * that fails. Your own join shows its count but can't be liked.
 */
export function JoinedLine({ item, mine }: { item: JoinedItem; mine: boolean }) {
  const [liked, setLiked] = useState(item.liked);
  const [count, setCount] = useState(item.likes);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy || mine) return;
    const next = !liked;
    setBusy(true);
    setLiked(next);
    setCount((n) => n + (next ? 1 : -1));
    try {
      const r = await api<{ liked: boolean; likes: number }>(`/joins/${encodeURIComponent(item.username)}/like`, {
        method: next ? "PUT" : "DELETE",
      });
      setLiked(r.liked);
      setCount(r.likes);
    } catch {
      setLiked(!next);
      setCount((n) => n + (next ? -1 : 1));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="joined-line">
      <Link href={`/u/${item.username}`} className="plain joined-who">
        <Avatar username={item.username} avatarId={item.avatarId} size={24} />
        <span className="joined-text">
          <b>{mine ? "You" : item.username}</b> <span className="muted">joined Crunchd</span>
        </span>
      </Link>
      <span className="small muted joined-when">{timeAgo(item.joinedAt)}</span>
      <span className="joined-like">
        {mine ? (
          count > 0 && <span className="small muted">{count} ♥</span>
        ) : (
          <>
            <button
              type="button"
              className={liked ? "heart on" : "heart"}
              aria-pressed={liked}
              aria-label={liked ? `Unlike ${item.username} joining` : `Like ${item.username} joining`}
              onClick={toggle}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.3 0 5.6 3.1 4.4 6.6-1.7 4.8-9.2 9.4-9.2 9.4z" />
              </svg>
            </button>
            {count > 0 && <span className="small muted">{count}</span>}
          </>
        )}
      </span>
    </div>
  );
}
