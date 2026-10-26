import { useEffect, useState } from "react";
import type { GroupPreview } from "../../shared/types";
import { api, errorText } from "../api";
import { GroupBadge } from "../components/GroupBadge";
import { Link } from "../components/Link";
import { navigate } from "../router";

/** Where invite links land: /join/<code>. */
export function Join({ code }: { code: string }) {
  const [group, setGroup] = useState<GroupPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<GroupPreview>(`/groups/join/${encodeURIComponent(code)}`)
      .then(setGroup)
      .catch((err) => setError(errorText(err)));
  }, [code]);

  if (error && !group) {
    return (
      <div className="page empty">
        <h2>Invite not found</h2>
        <p className="muted">{error}</p>
        <Link href="/groups" className="button">
          Go to your groups
        </Link>
      </div>
    );
  }
  if (!group) return <p className="muted page">Loading…</p>;

  const join = async () => {
    setBusy(true);
    try {
      await api("/groups/join", { body: { code } });
      navigate(`/groups/${group.id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <div className="page empty">
      <GroupBadge name={group.name} pictureId={group.pictureId} size={72} />
      <h2>{group.name}</h2>
      <p className="muted">
        {group.members} {group.members === 1 ? "member" : "members"}
      </p>
      {error && <p className="error">{error}</p>}
      {group.isMember ? (
        <Link href={`/groups/${group.id}`} className="button big">
          You're in. Open the group
        </Link>
      ) : group.full ? (
        <p className="muted">This group is full.</p>
      ) : (
        <button type="button" className="button big" disabled={busy} onClick={join}>
          {busy ? "Joining…" : "Join the group"}
        </button>
      )}
    </div>
  );
}
