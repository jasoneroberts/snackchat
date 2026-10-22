import { useEffect, useState } from "react";
import { getCategory } from "../../shared/catalogue";
import type { GroupPage } from "../../shared/types";
import { api, errorText, type Me } from "../api";
import { Avatar } from "../components/Avatar";
import { GroupBadge } from "../components/GroupBadge";
import { Link } from "../components/Link";
import { SnackTile } from "../components/SnackTile";
import { rating } from "../lib/format";
import { modeOf, resetOf, resetsIn } from "../lib/groups";
import { navigate } from "../router";

export function Group({ id, me }: { id: string; me: Me }) {
  const [data, setData] = useState<GroupPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    api<GroupPage>(`/groups/${encodeURIComponent(id)}`)
      .then(setData)
      .catch((err) => setError(errorText(err)));
  }, [id]);

  if (error) return <p className="error page">{error}</p>;
  if (!data) return <p className="muted page">Loading…</p>;

  const { group, board, favourite } = data;
  const mode = modeOf(group.scoringMode);
  const types = group.categories?.map((c) => getCategory(c)?.short ?? c).join(", ");
  const isOwner = data.myRole === "owner";

  const leaveOrDelete = async () => {
    const question = isOwner
      ? `Delete ${group.name} for everyone? Check-ins aren't affected.`
      : `Leave ${group.name}? You can rejoin with the code.`;
    if (!confirm(question)) return;
    try {
      if (isOwner) await api(`/groups/${group.id}`, { method: "DELETE" });
      else await api(`/groups/${group.id}/leave`, { method: "POST" });
      navigate("/groups");
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <div className="page stack">
      <div className="card-plain row gap-lg">
        <GroupBadge name={group.name} size={60} />
        <div className="grow">
          <h1 className="title">{group.name}</h1>
          <div className="small muted">
            {board.length} {board.length === 1 ? "member" : "members"} · {types ? `${types} only` : "all snacks"}
          </div>
        </div>
      </div>

      <div className="two-up">
        <Link href={`/groups/${group.id}/invite`} className="button">
          Invite people
        </Link>
        <Link href="/checkin" className="button secondary">
          Check in a snack
        </Link>
      </div>

      <section className="card-plain flush">
        <div className="board-head">
          <b className="big-text">{resetOf(group.resetPeriod).board}</b>
          <span className="small muted">
            ranked by {mode.label.toLowerCase()}
            {data.periodEnd && ` · ${resetsIn(data.periodEnd)?.toLowerCase()}`}
          </span>
        </div>
        <ol className="board">
          {board.map((r) => {
            const isMe = r.username === me.username;
            return (
              <li key={r.username} className={isMe ? "me" : undefined}>
                <span className="board-rank">{r.rank}</span>
                <Link href={`/u/${r.username}`} className="plain row grow">
                  <Avatar username={r.username} size={34} />
                  <span className="grow">
                    <b>@{r.username}</b>
                    {isMe && <span className="muted"> (you)</span>}
                    {r.role === "owner" && <span className="tag">runs it</span>}
                  </span>
                </Link>
                <b>
                  {r.value} <span className="small muted">{mode.unit}</span>
                </b>
              </li>
            );
          })}
        </ol>
        {board.length === 1 && (
          <p className="small muted board-note">It's just you so far. Invite some people to make it a competition.</p>
        )}
      </section>

      {favourite && (
        <Link href={`/snack/${favourite.id}`} className="list-card">
          <SnackTile snack={favourite} size={48} />
          <span className="grow">
            <span className="small accent block">Group's favourite snack</span>
            <b>{favourite.name}</b>
            <span className="small muted block">
              {favourite.brand} · {favourite.checkins} check-in{favourite.checkins === 1 ? "" : "s"}
            </span>
          </span>
          <b className="big-text">{rating(Number(favourite.avg.toFixed(2)))}</b>
        </Link>
      )}

      <button type="button" className="link-button centre-self" onClick={leaveOrDelete}>
        {isOwner ? "Delete this group" : "Leave this group"}
      </button>
    </div>
  );
}
