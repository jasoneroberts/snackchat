import { useEffect, useState } from "react";
import type { ProfilePage } from "../../shared/types";
import { adminToDo, api, errorText, type Me } from "../api";
import { Avatar } from "../components/Avatar";
import { CheckinCard } from "../components/CheckinCard";
import { Link } from "../components/Link";
import { ReportButton } from "../components/Report";
import { rating } from "../lib/format";
import { useVoice } from "../lib/voice";

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
  const { t } = useVoice();
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

  // Block or unblock this person, then reload so their check-ins hide or come back.
  const setBlock = async (block: boolean) => {
    const name = data?.profile.username ?? username;
    if (block && !confirm(`Block @${name}? You won't see each other's check-ins. They aren't told.`)) return;
    try {
      await api(`/blocks/${encodeURIComponent(name)}`, { method: block ? "PUT" : "DELETE" });
      load();
    } catch (err) {
      setError(errorText(err));
    }
  };

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
            {adminToDo(me) > 0 && <span className="count-badge">{adminToDo(me)}</span>}
          </Link>
        )}
      </div>

      {!isMe && (
        <div className="row profile-actions">
          <ReportButton type="user" id={data.profile.id} />
          {data.blocked === "you" ? (
            <button type="button" className="link-button small" onClick={() => setBlock(false)}>
              Unblock
            </button>
          ) : (
            data.blocked === null && (
              <button type="button" className="link-button small delete" onClick={() => setBlock(true)}>
                Block
              </button>
            )
          )}
        </div>
      )}

      {data.blocked === "you" ? (
        <p className="muted">You've blocked @{data.profile.username}. You won't see each other's check-ins.</p>
      ) : (
        data.private && <p className="muted">{data.blocked === "hidden" ? "You can't see this profile." : "This profile is private."}</p>
      )}

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

      {data.checkins && (
        <>
          <h2 className="section-title">{t("profile.recent")}</h2>
          {data.checkins.length === 0 && <p className="muted">{t("profile.none")}</p>}
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
