import { useEffect, useState, type FormEvent } from "react";
import type { GroupCard } from "../../shared/types";
import { api, errorText } from "../api";
import { GroupBadge } from "../components/GroupBadge";
import { Link } from "../components/Link";
import { modeOf, ordinal, resetOf } from "../lib/groups";
import { navigate } from "../router";

export function Groups() {
  const [groups, setGroups] = useState<GroupCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    api<{ groups: GroupCard[] }>("/groups")
      .then((r) => setGroups(r.groups))
      .catch((err) => setError(errorText(err)));
  }, []);

  const join = async (e: FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    try {
      const { id } = await api<{ id: string }>("/groups/join", { body: { code } });
      navigate(`/groups/${id}`);
    } catch (err) {
      setJoinError(errorText(err));
    }
  };

  return (
    <div className="page stack">
      <div>
        <h1 className="title">Your groups</h1>
        <p className="muted no-margin">Private leagues for your mates, family or office. Anyone can start one and invite people.</p>
      </div>

      <Link href="/groups/new" className="button big">
        + Start a group
      </Link>

      {error && <p className="error">{error}</p>}
      {groups === null && !error && <p className="muted">Loading…</p>}
      {groups?.length === 0 && <p className="muted">You're not in any groups yet.</p>}
      {groups?.map((g) => (
        <Link key={g.id} href={`/groups/${g.id}`} className="list-card">
          <GroupBadge name={g.name} />
          <span className="grow">
            <b className="big-text block">{g.name}</b>
            <span className="small muted">
              {g.members} {g.members === 1 ? "member" : "members"} · {modeOf(g.scoringMode).label} ·{" "}
              {resetOf(g.resetPeriod).board.toLowerCase()}
            </span>
          </span>
          {g.myRank !== null && (
            <span className="rank-box">
              <b>{ordinal(g.myRank)}</b>
              <span className="small muted">your rank</span>
            </span>
          )}
        </Link>
      ))}

      <form className="card-plain stack-sm" onSubmit={join}>
        <label htmlFor="join-code" className="field-label">
          Got an invite code?
        </label>
        <div className="row">
          <input
            id="join-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. K7QXPM"
            autoCapitalize="characters"
            autoComplete="off"
            className="code-input"
          />
          <button type="submit" className="button dark" disabled={code.trim().length < 4}>
            Join
          </button>
        </div>
        {joinError && <p className="error">{joinError}</p>}
      </form>
    </div>
  );
}
