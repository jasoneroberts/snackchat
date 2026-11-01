import { useEffect, useRef, useState } from "react";
import { CROWN_BADGE, voicedBadge, type AchievementsPage, type BadgeState } from "../../shared/achievements";
import { api } from "../api";
import { badgesStarted, markBadgesSeen, markBadgesStarted, seenBadges } from "../lib/badgesSeen";
import { useVoice } from "../lib/voice";
import { ShareBadge } from "./Achievements";

// Look at most this often (opening the app, coming back to it, moving between pages).
const EVERY_MS = 60_000;
const HOUR = 3600;
const WEEK = 7 * 86400;

/**
 * "New badge!" (or "New chieve!" in lad mode), wherever you are in the app.
 *
 * Many badges are earned by something other people do (25 hearts, a friend
 * joining from your invite link, a photo approved, winning the week), so
 * there's no one screen to announce them on. Instead the app asks for your
 * badges when it opens, when you come back to it, and as you move between
 * pages (at most once a minute). Asking also hands out anything you've
 * just reached. Any earned badge this phone hasn't shown you yet pops up
 * here, one at a time, with a button to share it.
 *
 * The first time on a phone there's no list of what you've seen, so
 * everything you already had is quietly marked seen, apart from anything
 * from the last hour and a King of the Castle from the last week.
 */
export function BadgePopup({ username, path }: { username: string; path: string }) {
  const { voice, t } = useVoice();
  const [queue, setQueue] = useState<BadgeState[]>([]);
  const [sharing, setSharing] = useState<BadgeState | null>(null);
  const lastLook = useRef(0);

  const look = async (force = false) => {
    if (!force && Date.now() - lastLook.current < EVERY_MS) return;
    lastLook.current = Date.now();
    let page: AchievementsPage;
    try {
      page = await api<AchievementsPage>("/achievements");
    } catch {
      return; // Offline or signed out: try again next time.
    }
    const earned = page.badges.filter((b) => b.earnedAt !== null);
    if (!badgesStarted()) {
      const now = Date.now() / 1000;
      const fresh = (b: BadgeState) => now - b.earnedAt! < HOUR || (b.id === CROWN_BADGE && now - b.earnedAt! < WEEK);
      markBadgesSeen(earned.filter((b) => !fresh(b)).map((b) => b.id));
      markBadgesStarted();
    }
    const seen = seenBadges();
    const unseen = earned.filter((b) => !seen.has(b.id));
    if (!unseen.length) return;
    setQueue((q) => [...q, ...unseen.filter((b) => !q.some((x) => x.id === b.id))]);
  };

  // On opening, on coming back to the app, and when another screen asks.
  useEffect(() => {
    void look(true);
    const onShow = () => document.visibilityState === "visible" && void look();
    const onAsk = () => void look(true);
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("crunchd:badges", onAsk);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("crunchd:badges", onAsk);
    };
  }, []);

  // Moving between pages. Waits a moment so a screen that announces its own
  // badge (the check-in screen) gets to mark it seen first.
  useEffect(() => {
    const timer = setTimeout(() => void look(), 1500);
    return () => clearTimeout(timer);
  }, [path]);

  const current = queue[0] ? voicedBadge(queue[0], voice) : null;
  const done = () => {
    if (queue[0]) markBadgesSeen([queue[0].id]);
    setQueue((q) => q.slice(1));
  };

  if (sharing) {
    return <ShareBadge badge={sharing} username={username} onClose={() => setSharing(null)} />;
  }
  if (!current) return null;
  return (
    <div className="sheet-backdrop" onClick={done}>
      <div className="sheet stack-sm centre badge-popup" role="dialog" aria-modal="true" aria-label={t("badges.new")} onClick={(e) => e.stopPropagation()}>
        <span className="badge-medal big badge-pop" aria-hidden="true">
          {current.emoji}
        </span>
        <div className="small accent">{t("badges.new")}</div>
        <h2 className="section-title">{current.name}</h2>
        <p className="no-margin">{current.description}</p>
        <button
          type="button"
          className="button"
          onClick={() => {
            setSharing(current);
            done();
          }}
        >
          Share it
        </button>
        <button type="button" className="link-button" onClick={done}>
          {queue.length > 1 ? "Next" : voice === "lad" ? "Get in" : "Nice"}
        </button>
      </div>
    </div>
  );
}
