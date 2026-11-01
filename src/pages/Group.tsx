import { useEffect, useState } from "react";
import { getCategory } from "../../shared/catalogue";
import type { FeedItem, GroupPage } from "../../shared/types";
import { api, errorText, type Me } from "../api";
import { Avatar, Crown } from "../components/Avatar";
import { CheckinCard } from "../components/CheckinCard";
import { GroupBadge } from "../components/GroupBadge";
import { Link } from "../components/Link";
import { SnackTile } from "../components/SnackTile";
import { rating } from "../lib/format";
import { modeOf, resetOf, resetsIn, whatsAppInvite } from "../lib/groups";
import { navigate } from "../router";
import { useVoice } from "../lib/voice";

const SMALL_SQUAD = 4;

/** "amy and bob", "amy, bob and cat". */
const joinNames = (names: string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export function Group({ id, me }: { id: string; me: Me }) {
  const { t } = useVoice();
  const [data, setData] = useState<GroupPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<FeedItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);

  const loadRecent = (before?: string) =>
    api<{ items: FeedItem[]; next: string | null }>(
      `/groups/${encodeURIComponent(id)}/checkins${before ? `?before=${encodeURIComponent(before)}` : ""}`,
    )
      .then((page) => {
        setRecent((prev) => (before && prev ? [...prev, ...page.items] : page.items));
        setNext(page.next);
      })
      .catch((err) => setError(errorText(err)));

  useEffect(() => {
    setData(null);
    setRecent(null);
    api<GroupPage>(`/groups/${encodeURIComponent(id)}`)
      .then(setData)
      .catch((err) => setError(errorText(err)));
    loadRecent();
  }, [id]);

  if (error) return <p className="error page">{error}</p>;
  if (!data) return <p className="muted page">Loading…</p>;

  const { group, board, favourite } = data;
  const mode = modeOf(group.scoringMode);
  const types = group.categories?.map((c) => getCategory(c)?.short ?? c).join(", ");
  const isOwner = data.myRole === "owner";
  // Last week's winner(s) wear a crown on the table and on their check-ins here.
  const crowned = new Set(data.champions.map((c) => c.username));
  const champ = data.champions[0];

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
        {isOwner ? (
          <Link href={`/groups/${group.id}/edit`} className="plain" aria-label="Change picture">
            <GroupBadge name={group.name} pictureId={group.pictureId} size={60} />
          </Link>
        ) : (
          <GroupBadge name={group.name} pictureId={group.pictureId} size={60} />
        )}
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
                  <Avatar username={r.username} avatarId={r.avatarId} size={34} crown={crowned.has(r.username)} />
                  <span className="grow">
                    <b>{r.username}</b>
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
        {champ && (
          <p className="champion-note small muted">
            <Crown size={14} />
            <span>
              {data.champions.length === 1 ? (
                <>
                  <b>{champ.username}</b> won last week with {champ.value} {mode.unit}
                  {data.championTie && " (a tie, but they got there first)"}
                </>
              ) : (
                <>
                  <b>{joinNames(data.champions.map((c) => c.username))}</b> tied last week on {champ.value} {mode.unit}
                </>
              )}
            </span>
          </p>
        )}
      </section>

      {/* Small squads are where people drift off, so nudge until there's a proper table. */}
      {board.length < SMALL_SQUAD && (
        <div className="notice stack-sm">
          <p className="no-margin">
            <b>{board.length === 1 ? "It's just you so far." : `Only ${board.length} of you so far.`}</b>{" "}
            {t("title.group")}s are best with {SMALL_SQUAD} or more. Drop the link in your group chat.
          </p>
          <a className="button whatsapp" href={whatsAppInvite(group.name, group.inviteCode)} target="_blank" rel="noreferrer">
            Invite on WhatsApp
          </a>
        </div>
      )}

      {favourite && (
        <Link href={`/snack/${favourite.id}`} className="list-card">
          <SnackTile snack={favourite} size={48} />
          <span className="grow">
            <span className="small accent block">{t("groups.favourite", { category: favourite.category })}</span>
            <b>{favourite.name}</b>
            <span className="small muted block">
              {favourite.brand} · {favourite.checkins === 1 ? "1 check-in, provisional" : `${favourite.checkins} check-ins`}
            </span>
          </span>
          <b className="big-text">{rating(Number(favourite.avg.toFixed(2)))}</b>
        </Link>
      )}

      <section className="stack">
        <h2 className="section-title no-margin">Recent check-ins</h2>
        {!recent ? (
          <p className="muted">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="small muted">Nobody here has checked in a snack yet.</p>
        ) : (
          recent.map((item) => {
            // Check-ins of other snack types still show, but say why they score nothing here.
            const counts = !group.categories || group.categories.includes(item.snack.category);
            return (
              <div key={item.id}>
                {!counts && (
                  <p className="small muted not-counted-note">
                    Doesn't count here: {getCategory(item.snack.category)?.short ?? "this type"} isn't one of this{" "}
                    {t("title.group").toLowerCase()}'s snack types.
                  </p>
                )}
                <CheckinCard item={item} mine={item.username === me.username} crowned={crowned.has(item.username)} />
              </div>
            );
          })
        )}
        {next && (
          <button type="button" className="button secondary" onClick={() => loadRecent(next)}>
            Show more
          </button>
        )}
      </section>

      {isOwner && (
        <Link href={`/groups/${group.id}/edit`} className="button secondary">
          Change settings
        </Link>
      )}

      <button type="button" className="link-button centre-self" onClick={leaveOrDelete}>
        {isOwner ? "Delete this group" : "Leave this group"}
      </button>
    </div>
  );
}
