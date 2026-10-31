import { useEffect, useState } from "react";
import type { Me } from "../api";
import { pushState, turnOnPush } from "../lib/push";
import { shouldAskForPush, snoozePushAsk } from "../lib/pushAsk";
import { useVoice } from "../lib/voice";
import { REMIND_AFTER_DAYS } from "../../shared/reminders";

/**
 * The "Turn on notifications?" sheet. Phones won't let a website switch
 * notifications on by itself, so this is the closest we can get to "on by
 * default": we ask at a good moment, and "Turn on" is the one tap the phone
 * needs before it shows its own Allow prompt.
 *
 * When it shows: on the feed, once they've checked in at least once (so
 * brand-new people see it right after their first check-in, and everyone
 * who already has check-ins sees it the next time they open the app), and
 * only if one tap can actually turn it on (see shouldAskForPush).
 */
export function PushPrompt({ me, path }: { me: Me; path: string }) {
  const { t } = useVoice();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const ready = path === "/" && me.points > 0;
  useEffect(() => {
    if (!ready || open) return;
    let cancelled = false;
    // A short wait so it doesn't land on top of the "Checked in" toast straight away.
    const timer = setTimeout(() => {
      pushState()
        .then((state) => !cancelled && shouldAskForPush(state) && setOpen(true))
        .catch(() => {});
    }, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready]);

  if (!open) return null;

  const notNow = () => {
    snoozePushAsk();
    setOpen(false);
  };

  const turnOn = async () => {
    setBusy(true);
    setNote(null);
    try {
      // This is where the phone shows its own "Allow notifications?" prompt.
      const state = await turnOnPush();
      if (state === "on") return setOpen(false);
      // They said no on the phone's prompt. Don't ask again from here.
      snoozePushAsk();
      setNote("No problem. If you change your mind, allow notifications for Crunchd in your phone's settings.");
    } catch {
      setNote("That didn't work. You can try again from Settings.");
    }
    setBusy(false);
  };

  return (
    <div className="sheet-backdrop" onClick={note ? () => setOpen(false) : notNow}>
      <div className="sheet stack-sm" role="dialog" aria-modal="true" aria-label={t("push.title")} onClick={(e) => e.stopPropagation()}>
        <div className="push-bell" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        </div>
        <h2 className="section-title">{t("push.title")}</h2>
        <p className="small muted no-margin">
          {t("push.body", { vars: { days: REMIND_AFTER_DAYS } })}
          {me.isAdmin && " As an admin you'll also hear about new people, photos to approve, reports and new snacks."}
        </p>
        {note ? (
          <>
            <p className="small no-margin">{note}</p>
            <button type="button" className="button" onClick={() => setOpen(false)}>
              OK
            </button>
          </>
        ) : (
          <>
            <button type="button" className="button big" disabled={busy} onClick={turnOn}>
              {busy ? "Turning on…" : t("push.yes")}
            </button>
            <button type="button" className="link-button" disabled={busy} onClick={notNow}>
              {t("push.no")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
