import { useEffect, useState } from "react";
import { voicedBadge, type AchievementsPage, type BadgeState } from "../../shared/achievements";
import { markBadgesSeen } from "../lib/badgesSeen";
import { makeBadgeCard } from "../lib/badgeCard";
import { withInviter } from "../lib/ref";
import { useVoice } from "../lib/voice";
import { SharePicture } from "./SharePicture";

/**
 * The streak line and badge grid on a profile. Earned badges are in colour,
 * the rest are faded with how far along you are ("12/25"). Tap one to see
 * what it's for; on your own profile, an earned badge can be shared as a
 * picture.
 */
export function Achievements({ data, username, isMe }: { data: AchievementsPage; username: string; isMe: boolean }) {
  const { voice, t } = useVoice();
  const [open, setOpen] = useState<BadgeState | null>(null);
  const [sharing, setSharing] = useState<BadgeState | null>(null);
  const badges = data.badges.map((b) => voicedBadge(b, voice));
  const earned = badges.filter((b) => b.earnedAt !== null).length;

  return (
    <section className="card-plain stack-sm">
      <StreakLine streak={data.streak} isMe={isMe} />
      <div className="row-between">
        <h2 className="section-title no-margin">{t("badges.title")}</h2>
        <span className="small muted">
          {earned} of {badges.length}
        </span>
      </div>
      <div className="badge-grid">
        {badges.map((b) => (
          <button key={b.id} type="button" className={`badge-cell ${b.earnedAt ? "earned" : "locked"}`} onClick={() => setOpen(b)}>
            <span className="badge-medal" aria-hidden="true">
              {b.emoji}
            </span>
            <span className="badge-name">{b.name}</span>
            {!b.earnedAt && b.progress !== null && b.goal > 1 && (
              <span className="badge-progress">
                {b.progress}/{b.goal}
              </span>
            )}
          </button>
        ))}
      </div>

      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(null)}>
          <div className="sheet stack-sm centre" role="dialog" aria-modal="true" aria-label={open.name} onClick={(e) => e.stopPropagation()}>
            <span className={`badge-medal big ${open.earnedAt ? "" : "locked"}`} aria-hidden="true">
              {open.emoji}
            </span>
            <h2 className="section-title">{open.name}</h2>
            <p className="no-margin">{open.description}</p>
            <p className="small muted no-margin">
              {open.earnedAt
                ? `Earned ${new Date(open.earnedAt * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                : open.progress !== null && open.goal > 1
                  ? `${open.progress} of ${open.goal} so far`
                  : "Not yet"}
            </p>
            {isMe && open.earnedAt && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  setSharing(open);
                  setOpen(null);
                }}
              >
                Share it
              </button>
            )}
            <button type="button" className="link-button" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
        </div>
      )}
      {sharing && <ShareBadge badge={sharing} username={username} onClose={() => setSharing(null)} />}
    </section>
  );
}

function StreakLine({ streak, isMe }: { streak: AchievementsPage["streak"]; isMe: boolean }) {
  const { voice } = useVoice();
  const weeks = (n: number) => `${n} ${n === 1 ? "week" : "weeks"}`;
  let note: string;
  if (streak.current === 0) note = isMe ? "Check in this week to start a weekly streak." : "No streak going right now.";
  else if (streak.thisWeek) note = isMe ? "Safe for this week. Check in again next week to keep it going." : "Checked in this week.";
  else note = isMe ? (voice === "lad" ? "Nothing logged this week. Don't bottle it: log one by Sunday." : "Check in by Sunday night to keep it going.") : "Not checked in yet this week.";
  return (
    <div className="streak-line">
      <span className={`streak-flame ${streak.current ? "" : "out"}`} aria-hidden="true">
        🔥
      </span>
      <div className="grow">
        <div className="big-text">{streak.current ? `${weeks(streak.current)} in a row` : "No streak yet"}</div>
        <div className="small muted">
          {note}
          {streak.best > streak.current && ` Best: ${weeks(streak.best)}.`}
        </div>
      </div>
    </div>
  );
}

/** The share sheet for one badge. Used on the profile and straight after earning it. */
export function ShareBadge({ badge, username, onClose }: { badge: BadgeState; username: string; onClose: () => void }) {
  const { t } = useVoice();
  const link = withInviter(`${window.location.origin}/?ref=badge`, username);
  return (
    <SharePicture
      title={`Share ${badge.name}`}
      make={() => makeBadgeCard({ badge, username, site: window.location.host, heading: t("badges.cardTop") })}
      text={`${t("badges.shareText", { vars: { name: badge.name } })} ${badge.emoji} ${badge.description} Can you get it? ${link}`}
      link={link}
      alt={`I earned ${badge.name} on Crunchd`}
      onClose={onClose}
    />
  );
}

/** "New badge!" rows, shown after a check-in. They count as seen, so the popup doesn't repeat them. */
export function NewBadges({ badges: raw, username }: { badges: BadgeState[]; username: string }) {
  const { voice, t } = useVoice();
  const [sharing, setSharing] = useState<BadgeState | null>(null);
  const badges = raw.map((b) => voicedBadge(b, voice));
  useEffect(() => markBadgesSeen(raw.map((b) => b.id)), [raw]);
  if (!badges.length) return null;
  return (
    <div className="stack-sm">
      {badges.map((b) => (
        <div key={b.id} className="new-badge">
          <span className="badge-medal" aria-hidden="true">
            {b.emoji}
          </span>
          <div className="grow">
            <div className="small accent">{t("badges.new")}</div>
            <div className="big-text">{b.name}</div>
          </div>
          <button type="button" className="button small secondary" onClick={() => setSharing(b)}>
            Share
          </button>
        </div>
      ))}
      {sharing && <ShareBadge badge={sharing} username={username} onClose={() => setSharing(null)} />}
    </div>
  );
}
