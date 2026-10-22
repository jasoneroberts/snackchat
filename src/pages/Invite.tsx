import { useEffect, useState } from "react";
import type { GroupPage } from "../../shared/types";
import { api, errorText } from "../api";
import { GroupBadge } from "../components/GroupBadge";
import { Link } from "../components/Link";
import { inviteLink, modeOf } from "../lib/groups";
import { useVoice } from "../lib/voice";

export function Invite({ id }: { id: string }) {
  const { t } = useVoice();
  const [data, setData] = useState<GroupPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isNew = new URLSearchParams(window.location.search).has("new");

  useEffect(() => {
    api<GroupPage>(`/groups/${encodeURIComponent(id)}`)
      .then(setData)
      .catch((err) => setError(errorText(err)));
  }, [id]);

  if (error) return <p className="error page">{error}</p>;
  if (!data) return <p className="muted page">Loading…</p>;

  const { group } = data;
  const link = inviteLink(group.inviteCode);
  const message = `Join my Snackchat group "${group.name}" and let's see who's the snack champ: ${link}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Press and hold the link to copy it instead.");
    }
  };

  // The phone's own share sheet (Messages, Instagram, email...) where there is one.
  const shareOther = async () => {
    if (navigator.share) {
      await navigator.share({ title: `Join ${group.name} on Snackchat`, text: message, url: link }).catch(() => {});
    } else {
      await copy();
    }
  };

  return (
    <div className="page stack">
      <div className="card-plain centre stack-sm">
        <GroupBadge name={group.name} size={64} />
        <h1 className="title">{group.name}</h1>
        <p className="muted no-margin">
          {isNew ? t("groups.ready") : `Ranked by ${modeOf(group.scoringMode).label.toLowerCase()}.`}
        </p>
      </div>

      <div className="field">
        <span className="field-label">Invite link</span>
        <div className="link-box">
          <span className="link-text">{link}</span>
          <button type="button" className="button small dark" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <span className="small muted">
          Or share the code <b className="code">{group.inviteCode}</b>. Anyone with it can join.
        </span>
      </div>

      <div className="two-up">
        <a className="button" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
        <button type="button" className="button secondary" onClick={shareOther}>
          Other apps
        </button>
      </div>

      <Link href={`/groups/${group.id}`} className="button big dark">
        {isNew ? "Go to the group" : "Done"}
      </Link>
    </div>
  );
}
