import { useEffect, useState } from "react";
import type { ReviewQueue } from "../../shared/types";
import { api, errorText } from "../api";
import { timeAgo } from "../lib/format";

type Action = "approve" | "reject";

/** The admin queue: every new check-in photo and profile picture waits here. */
export function Review({ onChanged }: { onChanged: () => void }) {
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ReviewQueue>("/admin/queue")
      .then(setQueue)
      .catch((err) => setError(errorText(err)));
  }, []);

  // Send the decision, then drop the item from the list without reloading.
  const decide = async (key: string, path: string, action: Action, remove: (q: ReviewQueue) => ReviewQueue) => {
    setBusy(key);
    setError(null);
    try {
      await api(path, { body: { action } });
      setQueue((q) => (q ? remove(q) : q));
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  if (error && !queue) return <p className="error page">{error}</p>;
  if (!queue) return <p className="muted page">Loading…</p>;

  const empty = queue.photos.length === 0 && queue.avatars.length === 0;

  return (
    <div className="page stack">
      <p className="small muted">
        Approved photos show to everyone. Rejecting one deletes it and takes back its photo points; the check-in stays.
      </p>
      {error && <p className="error">{error}</p>}
      {empty && <p className="muted">Nothing waiting. All clear.</p>}

      {queue.photos.map((p) => (
        <article key={p.id} className="card-plain stack-sm review-item">
          <img className="review-photo" src={`/api/photos/${p.id}`} alt={`Photo of ${p.snackName} by @${p.username}`} />
          <div>
            <b>{p.snackName}</b>
            <div className="small muted">
              @{p.username} · {timeAgo(p.createdAt)}
            </div>
            {p.review && <p className="small review-text">{p.review}</p>}
          </div>
          <Buttons
            disabled={busy !== null}
            onPick={(action) =>
              decide(p.id, `/admin/photos/${p.id}`, action, (q) => ({ ...q, photos: q.photos.filter((x) => x.id !== p.id) }))
            }
          />
        </article>
      ))}

      {queue.avatars.length > 0 && <h2 className="section-title">Profile pictures</h2>}
      {queue.avatars.map((a) => (
        <article key={a.userId} className="card-plain row review-item">
          <img className="review-avatar" src={`/api/avatars/${a.avatarId}`} alt={`New picture for @${a.username}`} />
          <div className="grow stack-sm">
            <b>@{a.username}</b>
            <Buttons
              disabled={busy !== null}
              onPick={(action) =>
                decide(a.userId, `/admin/avatars/${a.userId}`, action, (q) => ({
                  ...q,
                  avatars: q.avatars.filter((x) => x.userId !== a.userId),
                }))
              }
            />
          </div>
        </article>
      ))}
    </div>
  );
}

function Buttons({ disabled, onPick }: { disabled: boolean; onPick: (action: Action) => void }) {
  return (
    <div className="photo-buttons">
      <button type="button" className="button" disabled={disabled} onClick={() => onPick("approve")}>
        Approve
      </button>
      <button type="button" className="button secondary" disabled={disabled} onClick={() => onPick("reject")}>
        Reject
      </button>
    </div>
  );
}
