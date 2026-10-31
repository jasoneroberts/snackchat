import { useEffect, useState } from "react";
import { percentages, type Battle, type BattlePage, type BadgeState, type BattleSnack } from "../../shared/achievements";
import { api, errorText, type Me } from "../api";
import { NewBadges } from "../components/Achievements";
import { Link } from "../components/Link";
import { SharePicture } from "../components/SharePicture";
import { SnackTile } from "../components/SnackTile";
import { makeBattleCard } from "../lib/battleCard";
import { withInviter } from "../lib/ref";

// Crisp of the Week (worker/lib/battle.ts). The card at the top of the feed
// and the full page at /cotw share the same pieces.

type VoteResult = BattlePage & { newBadges: BadgeState[] };

function useBattle() {
  const [page, setPage] = useState<BattlePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newBadges, setNewBadges] = useState<BadgeState[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<BattlePage>("/cotw").then(setPage).catch((err) => setError(errorText(err)));
  }, []);
  const vote = async (snackId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<VoteResult>("/cotw/vote", { method: "PUT", body: { snackId } });
      setPage({ current: res.current, last: res.last });
      setNewBadges(res.newBadges);
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  };
  return { page, setPage, error, setError, newBadges, busy, vote };
}

const daysLeft = (endsAt: number) => {
  const days = Math.ceil((endsAt - Date.now() / 1000) / 86400);
  return days <= 1 ? "Voting closes tonight" : `${days} days left to vote`;
};

/** The two snacks side by side: buttons before you vote, bars after. */
function Matchup({ battle, onVote, busy }: { battle: Battle; onVote?: (id: string) => void; busy: boolean }) {
  const pct = battle.votes ? percentages(battle.votes.a, battle.votes.b) : null;
  const crowned = battle.winner !== undefined ? battle.winner : null;
  const side = (snack: BattleSnack, percent: number | null) => {
    const mine = battle.myVote === snack.id;
    const won = crowned === snack.id;
    const content = (
      <>
        {won && <span className="cotw-crown" aria-label="Winner">👑</span>}
        <SnackTile snack={snack} size={84} />
        <span className="cotw-name">{snack.name}</span>
        {snack.brand && <span className="small muted">{snack.brand}</span>}
        {percent !== null && (
          <span className="cotw-percent">
            {percent}%{mine && <span className="small"> · your pick</span>}
          </span>
        )}
        {percent !== null && (
          <span className="bar-track cotw-bar">
            <span className="bar-fill" style={{ width: `${percent}%` }} />
          </span>
        )}
      </>
    );
    return onVote ? (
      <button
        type="button"
        className={`cotw-side ${mine ? "picked" : ""}`}
        disabled={busy || mine}
        onClick={() => onVote(snack.id)}
        aria-pressed={mine}
      >
        {content}
        {!mine && <span className="small accent">{battle.myVote ? "Switch to this" : "Vote"}</span>}
      </button>
    ) : (
      <div className={`cotw-side ${won ? "picked" : ""}`}>{content}</div>
    );
  };
  return (
    <div className="cotw-matchup">
      {side(battle.a, pct?.a ?? null)}
      <span className="cotw-vs">vs</span>
      {side(battle.b, pct?.b ?? null)}
    </div>
  );
}

function ShareBattle({ battle, username, onClose }: { battle: Battle; username: string; onClose: () => void }) {
  const link = withInviter(`${window.location.origin}/cotw?ref=cotw`, username);
  const finished = battle.winner !== undefined;
  const winnerName = battle.winner === battle.a.id ? battle.a.name : battle.winner === battle.b.id ? battle.b.name : null;
  const mine = battle.myVote === battle.a.id ? battle.a.name : battle.myVote === battle.b.id ? battle.b.name : null;
  const text = finished
    ? winnerName
      ? `${winnerName} is Crisp of the Week on Crunchd. Do you agree? ${link}`
      : `Crisp of the Week on Crunchd ended in a dead heat. ${link}`
    : `Crisp of the Week on Crunchd: ${battle.a.name} vs ${battle.b.name}.${mine ? ` I picked ${mine}.` : ""} Which would you pick? ${link}`;
  return (
    <SharePicture
      title={finished ? "Share the result" : "Share the battle"}
      make={() => makeBattleCard({ battle, site: window.location.host })}
      text={text}
      link={link}
      alt={`Crisp of the Week: ${battle.a.name} vs ${battle.b.name}`}
      onClose={onClose}
    />
  );
}

/** The card at the top of the feed. Hidden if there's no battle this week. */
export function CotwCard({ me }: { me: Me }) {
  const { page, error, newBadges, busy, vote } = useBattle();
  if (!page?.current) return null;
  const battle = page.current;
  const lastWinner = page.last?.winner ? (page.last.winner === page.last.a.id ? page.last.a.name : page.last.b.name) : null;
  return (
    <section className="card-plain stack-sm cotw-card">
      <div className="row-between">
        <h2 className="section-title no-margin">Crisp of the Week</h2>
        <span className="small muted">{daysLeft(battle.endsAt)}</span>
      </div>
      <Matchup battle={battle} onVote={vote} busy={busy} />
      {error && <p className="error small">{error}</p>}
      <NewBadges badges={newBadges} username={me.username} />
      <Link href="/cotw" className="small accent">
        {battle.myVote ? "Share it and see last week's ›" : lastWinner ? `Last week: ${lastWinner} won ›` : "More ›"}
      </Link>
    </section>
  );
}

/** /cotw: this week's battle, last week's result, sharing, and the admin's re-pick. */
export function Cotw({ me }: { me: Me }) {
  const { page, setPage, error, setError, newBadges, busy, vote } = useBattle();
  const [sharing, setSharing] = useState<Battle | null>(null);

  const repick = async () => {
    if (!confirm("Pick two other snacks for this week? Any votes so far are thrown away.")) return;
    try {
      setPage(await api<BattlePage>("/cotw/repick", { method: "POST" }));
    } catch (err) {
      setError(errorText(err));
    }
  };

  if (error && !page) return <p className="error page">{error}</p>;
  if (!page) return <p className="muted page">Loading…</p>;
  const { current, last } = page;

  return (
    <div className="page stack">
      <p className="muted no-margin">
        Two snacks, one vote each, a new pair every Monday. You can change your mind until Sunday night. Voters hear who won on
        Monday evening.
      </p>
      {current ? (
        <section className="card-plain stack-sm">
          <div className="row-between">
            <h2 className="section-title no-margin">This week</h2>
            <span className="small muted">{daysLeft(current.endsAt)}</span>
          </div>
          <Matchup battle={current} onVote={vote} busy={busy} />
          {error && <p className="error small">{error}</p>}
          {!current.votes && <p className="small muted no-margin">Vote to see how everyone else voted.</p>}
          <NewBadges badges={newBadges} username={me.username} />
          {current.myVote && (
            <button type="button" className="button" onClick={() => setSharing(current)}>
              Share the battle
            </button>
          )}
        </section>
      ) : (
        <p className="muted">No battle this week: there aren't enough snacks to pick two.</p>
      )}

      {last && (
        <section className="card-plain stack-sm">
          <h2 className="section-title no-margin">
            Last week:{" "}
            {last.winner ? `${last.winner === last.a.id ? last.a.name : last.b.name} won` : "a dead heat"}
          </h2>
          <Matchup battle={last} busy={false} />
          <p className="small muted no-margin">
            {(last.votes?.a ?? 0) + (last.votes?.b ?? 0)} votes
            {last.myVote && ` · you picked ${last.myVote === last.a.id ? last.a.name : last.b.name}`}
          </p>
          <button type="button" className="button secondary" onClick={() => setSharing(last)}>
            Share the result
          </button>
        </section>
      )}

      {me.isAdmin && current && (
        <button type="button" className="link-button small" onClick={repick}>
          Admin: pick two other snacks this week
        </button>
      )}
      {sharing && <ShareBattle battle={sharing} username={me.username} onClose={() => setSharing(null)} />}
    </div>
  );
}
