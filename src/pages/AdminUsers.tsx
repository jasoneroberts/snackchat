import { useEffect, useState } from "react";
import type { AdminUserRow } from "../../shared/types";
import { api, errorText } from "../api";
import { Avatar } from "../components/Avatar";
import { Link } from "../components/Link";
import { timeAgo } from "../lib/format";

/**
 * Admin page: everyone who has signed up, newest first, with a Reset PIN
 * button for when someone forgets theirs. Demo people are counted separately.
 */
export function AdminUsers({ meId }: { meId: string }) {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // The PIN just made for someone, shown once so it can be passed on.
  const [newPin, setNewPin] = useState<{ username: string; pin: string } | null>(null);

  useEffect(() => {
    api<{ users: AdminUserRow[] }>("/admin/users")
      .then((data) => setUsers(data.users))
      .catch((err) => setError(errorText(err)));
  }, []);

  const resetPin = async (u: AdminUserRow) => {
    if (!confirm(`Give @${u.username} a new PIN? Their old one stops working and they're signed out.`)) return;
    setBusy(u.id);
    setError(null);
    setNewPin(null);
    try {
      const { pin } = await api<{ pin: string }>(`/admin/users/${encodeURIComponent(u.id)}/pin`, { body: {} });
      setNewPin({ username: u.username, pin });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  if (error && !users) return <p className="error page">{error}</p>;
  if (!users) return <p className="muted page">Loading…</p>;

  const people = users.filter((u) => !u.isDemo);
  const demo = users.length - people.length;
  const activeThisWeek = people.filter((u) => u.lastActive && u.lastActive > Date.now() / 1000 - 7 * 86400).length;

  return (
    <div className="page stack">
      <div className="stat-row">
        <div className="stat card-plain">
          <b>{people.length}</b>
          <span className="small muted">{people.length === 1 ? "person" : "people"}</span>
        </div>
        <div className="stat card-plain">
          <b>{activeThisWeek}</b>
          <span className="small muted">active this week</span>
        </div>
        <div className="stat card-plain">
          <b>{people.reduce((n, u) => n + u.checkins, 0)}</b>
          <span className="small muted">check-ins</span>
        </div>
      </div>
      {demo > 0 && <p className="small muted no-margin">Plus {demo} demo people, listed at the bottom.</p>}

      {newPin && (
        <div className="notice good">
          <p>
            <b>@{newPin.username}'s new PIN is {newPin.pin}</b>
          </p>
          <p className="small no-margin">
            Send it to them. They sign in with their name and this PIN. It won't be shown again.
          </p>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <section className="card-plain">
        {users.map((u) => (
          <div key={u.id} className="user-row">
            <Link href={`/u/${encodeURIComponent(u.username)}`} className="row grow saved-link">
              <Avatar username={u.username} avatarId={u.avatarId} size={40} />
              <span className="grow">
                <b>@{u.username}</b>
                {u.isAdmin && <span className="tag">admin</span>}
                {u.isDemo && <span className="tag">demo</span>}
                <span className="small muted block">
                  Joined {timeAgo(u.joinedAt)} · {u.lastActive ? `last seen ${timeAgo(u.lastActive)}` : "not seen yet"}
                </span>
                <span className="small muted block">
                  {u.checkins} {u.checkins === 1 ? "check-in" : "check-ins"} · {u.points} pts · {u.groups}{" "}
                  {u.groups === 1 ? "group" : "groups"}
                </span>
              </span>
            </Link>
            {!u.isDemo && u.id !== meId && (
              <button type="button" className="button secondary small" disabled={busy !== null} onClick={() => resetPin(u)}>
                {busy === u.id ? "…" : "Reset PIN"}
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
