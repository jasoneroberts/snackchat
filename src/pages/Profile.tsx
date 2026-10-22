import { useEffect, useState } from "react";
import { UNIVERSAL } from "../../shared/catalogue";
import type { ProfilePage } from "../../shared/types";
import { api, errorText, type Me } from "../api";
import { Avatar } from "../components/Avatar";
import { Bars } from "../components/Bars";
import { CheckinCard } from "../components/CheckinCard";
import { Link } from "../components/Link";
import { rating } from "../lib/format";

export function Profile({
  username,
  me,
  devLogin,
  onLogOut,
  onChanged,
}: {
  username: string;
  me: Me;
  devLogin: boolean;
  onLogOut: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<ProfilePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMe = username.toLowerCase() === me.username.toLowerCase();

  const load = () =>
    api<ProfilePage>(`/users/${encodeURIComponent(username)}`)
      .then(setData)
      .catch((err) => setError(errorText(err)));

  useEffect(() => {
    setData(null);
    load();
  }, [username]);

  if (error) return <p className="error page">{error}</p>;
  if (!data) return <p className="muted page">Loading…</p>;

  const joined = new Date(data.profile.joinedAt * 1000).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

  return (
    <div className="page stack">
      <div className="profile-head">
        <Avatar username={data.profile.username} avatarId={data.profile.avatarId} size={72} />
        <div>
          <h1 className="title">@{data.profile.username}</h1>
          <div className="muted">
            {data.profile.country === "GB" ? "UK" : data.profile.country} · Snacking since {joined}
          </div>
        </div>
        {isMe && (
          <Link href="/settings" className="button secondary small profile-settings">
            Settings
          </Link>
        )}
      </div>

      {data.private && <p className="muted">This profile is private.</p>}

      {data.stats && (
        <div className="tiles four">
          <div className="tile">
            <b>{data.stats.checkins}</b>
            <span>Check-ins</span>
          </div>
          <div className="tile">
            <b>{data.stats.snacks}</b>
            <span>Snacks</span>
          </div>
          <div className="tile">
            <b>{data.stats.points}</b>
            <span>Points</span>
          </div>
          <div className="tile">
            <b>{data.stats.avg !== null ? rating(Number(data.stats.avg.toFixed(2))) : "–"}</b>
            <span>Avg given</span>
          </div>
        </div>
      )}

      {data.taste && Object.keys(data.taste).length > 0 && (
        <section className="card-plain">
          <h2 className="section-title">Taste profile</h2>
          <p className="small muted">Averages of the sliders across everything rated.</p>
          <Bars attributes={UNIVERSAL} values={data.taste} dark />
        </section>
      )}

      {data.checkins && (
        <>
          <h2 className="section-title">Recent check-ins</h2>
          {data.checkins.length === 0 && <p className="muted">No check-ins yet.</p>}
          {data.checkins.map((item) => (
            <CheckinCard
              key={item.id}
              item={item}
              mine={isMe}
              onDelete={async (id) => {
                try {
                  await api(`/checkins/${id}`, { method: "DELETE" });
                  onChanged();
                  load();
                } catch (err) {
                  setError(errorText(err));
                }
              }}
            />
          ))}
        </>
      )}

      {isMe && !devLogin && (
        <button type="button" className="button secondary" onClick={onLogOut}>
          Log out
        </button>
      )}
    </div>
  );
}
