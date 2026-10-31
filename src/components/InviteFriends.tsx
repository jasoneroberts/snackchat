import { useEffect, useState } from "react";
import { INVITE_POINTS } from "../../shared/ref";
import type { InviteStats } from "../../shared/types";
import { api } from "../api";
import { personalInviteLink } from "../lib/ref";
import { Avatar } from "./Avatar";

/**
 * The "Invite friends" card on your own profile: your personal link, ways to
 * send it, and who has joined from it so far. The points rules live in
 * shared/ref.ts (INVITE_POINTS) and worker/lib/referrals.ts.
 */
export function InviteFriends({ username }: { username: string }) {
  const [stats, setStats] = useState<InviteStats | null>(null);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const link = personalInviteLink(username);
  const message = `I'm rating snacks on Crunchd. Join me and let's see who has the best taste: ${link}`;

  useEffect(() => {
    api<InviteStats>("/account/invites").then(setStats).catch(() => setStats(null));
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNote("Couldn't copy. Press and hold the link to copy it instead.");
    }
  };

  // The phone's own share sheet (Messages, Instagram...) where there is one.
  const share = async () => {
    if (navigator.share) await navigator.share({ title: "Join me on Crunchd", text: message }).catch(() => {});
    else await copy();
  };

  return (
    <section className="card-plain stack-sm invite-friends">
      <h2 className="section-title no-margin">Invite friends</h2>
      <p className="small muted no-margin">
        Get <b>{INVITE_POINTS.join} pts</b> when a friend joins with your link, and <b>{INVITE_POINTS.firstCheckin} more</b> after
        their first check-in.{" "}
        {INVITE_POINTS.onBoards ? "They count on the points tables too." : "Invite points add to your total, not the tables."}
      </p>
      <div className="row">
        <a className="button whatsapp grow" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
        <button type="button" className="button secondary grow" onClick={share}>
          Other apps
        </button>
      </div>
      <div className="link-box">
        <span className="link-text">{link}</span>
        <button type="button" className="button small dark" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {note && <p className="small error no-margin">{note}</p>}
      {stats && stats.joined > 0 && (
        <div className="stack-sm">
          <p className="small no-margin">
            <b>{stats.joined}</b> joined · <b>{stats.checkedIn}</b> checked in · <b>{stats.points}</b> pts earned
          </p>
          <ul className="invite-list">
            {stats.friends.map((f) => (
              <li key={f.username}>
                <Avatar username={f.username} avatarId={f.avatarId} size={28} />
                <span className="grow">{f.username}</span>
                <span className="small muted">{f.checkedIn ? "checked in" : "not checked in yet"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
