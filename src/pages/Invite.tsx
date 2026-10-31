import { useEffect, useState } from "react";
import type { GroupPage } from "../../shared/types";
import { api, errorText } from "../api";
import { GroupBadge } from "../components/GroupBadge";
import { Link } from "../components/Link";
import { inviteLink, inviteMessage, modeOf, whatsAppInvite } from "../lib/groups";
import { useVoice } from "../lib/voice";
import { track } from "../lib/track";

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
  const message = inviteMessage(group.name, group.inviteCode);

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
    track("share");
    if (navigator.share) {
      await navigator.share({ title: `Join ${group.name} on Crunchd`, text: message, url: link }).catch(() => {});
    } else {
      await copy();
    }
  };

  return (
    <div className="page stack">
      <div className="card-plain centre stack-sm">
        <GroupBadge name={group.name} pictureId={group.pictureId} size={64} />
        <h1 className="title">{group.name}</h1>
        <p className="muted no-margin">
          {isNew ? t("groups.ready") : `Ranked by ${modeOf(group.scoringMode).label.toLowerCase()}.`}
        </p>
      </div>

      {/* WhatsApp first: one message in a group chat can bring the whole chat in. */}
      <a className="button big whatsapp" href={whatsAppInvite(group.name, group.inviteCode)} onClick={() => track("share")} target="_blank" rel="noreferrer">
        Send to a WhatsApp group
      </a>
      <p className="small muted no-margin centre">
        The link shows a preview with the {t("title.group").toLowerCase()}'s name, so people know what they're joining.
      </p>
      <button type="button" className="button secondary" onClick={shareOther}>
        Other apps
      </button>

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

      <Link href={`/groups/${group.id}`} className="button big dark">
        {isNew ? "Go to the group" : "Done"}
      </Link>
    </div>
  );
}
