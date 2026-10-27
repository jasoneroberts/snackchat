import { useEffect, useState } from "react";
import type { FeedItem, Liker } from "../../shared/types";
import { api, errorText } from "../api";
import { timeAgo } from "../lib/format";
import { Avatar } from "./Avatar";
import { Link } from "./Link";

/**
 * The heart under a check-in. Tapping the heart likes or unlikes it straight
 * away (the screen changes first, then the server is told, and it switches
 * back if that fails). Tapping the count shows who liked it.
 */
export function Likes({ item }: { item: FeedItem }) {
  const [liked, setLiked] = useState(item.liked);
  const [count, setCount] = useState(item.likes);
  const [busy, setBusy] = useState(false);
  const [showing, setShowing] = useState(false);

  const toggle = async () => {
    if (busy) return;
    const next = !liked;
    setBusy(true);
    setLiked(next);
    setCount((n) => n + (next ? 1 : -1));
    try {
      const r = await api<{ liked: boolean; likes: number }>(`/checkins/${encodeURIComponent(item.id)}/like`, {
        method: next ? "PUT" : "DELETE",
      });
      // The server's count includes anyone else who liked it meanwhile.
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
    <>
      <button
        type="button"
        className={liked ? "heart on" : "heart"}
        aria-pressed={liked}
        aria-label={liked ? "Unlike" : "Like"}
        onClick={toggle}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.3 0 5.6 3.1 4.4 6.6-1.7 4.8-9.2 9.4-9.2 9.4z" />
        </svg>
      </button>
      {count > 0 ? (
        <button type="button" className="link-button small heart-count" onClick={() => setShowing(true)}>
          {count} {count === 1 ? "like" : "likes"}
        </button>
      ) : (
        <span className="small muted heart-count">Like</span>
      )}
      {showing && <LikersSheet checkinId={item.id} onClose={() => setShowing(false)} />}
    </>
  );
}

/** Everyone who liked a check-in, newest first, each linking to their profile. */
function LikersSheet({ checkinId, onClose }: { checkinId: string; onClose: () => void }) {
  const [people, setPeople] = useState<Liker[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ people: Liker[] }>(`/checkins/${encodeURIComponent(checkinId)}/likes`)
      .then((r) => setPeople(r.people))
      .catch((err) => setError(errorText(err)));
  }, [checkinId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet stack-sm" role="dialog" aria-modal="true" aria-label="Liked by" onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title">Liked by</h2>
        {error && <p className="error">{error}</p>}
        {!people && !error && <p className="muted">Loading…</p>}
        {people?.length === 0 && <p className="muted">No likes yet.</p>}
        <div className="likers">
          {people?.map((p) => (
            <Link key={p.username} href={`/u/${p.username}`} className="row plain liker">
              <Avatar username={p.username} avatarId={p.avatarId} size={36} />
              <b className="grow">{p.username}</b>
              <span className="small muted">{timeAgo(p.likedAt)}</span>
            </Link>
          ))}
        </div>
        <button type="button" className="button secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
