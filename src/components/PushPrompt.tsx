import { useEffect, useState } from "react";
import type { Me } from "../api";
import { pushState, turnOnPush } from "../lib/push";
import {
  markBlockedHelpShown,
  markPushAsked,
  markTypesAsked,
  shouldAskAboutTypes,
  shouldAskForPush,
  shouldShowBlockedHelp,
  snoozePushAsk,
} from "../lib/pushAsk";
import { api } from "../api";
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
 *
 * Every kind of notification is on unless someone switches it off, so the
 * same spot also covers people who have some or all of it off:
 *  - "ask": notifications are off on this phone. We ask with back-off, and
 *    people we'd stopped asking get one more ask (see pushAsk.ts).
 *  - "blocked": they said no on the phone's own prompt, so only phone settings
 *    can fix it. Shown once, as a how-to.
 *  - "kinds": on for this phone, but they switched some kinds off in Settings.
 *    Asked once, and "Keep as they are" is respected.
 */
export interface PushKind {
  /** The Me field that says whether it's on. */
  field: "reminders" | "likeAlerts" | "squadAlerts";
  /** The PUT endpoint that switches it ({ on: boolean }). */
  path: string;
  label: string;
}

// Every kind someone can switch off in Settings. Add new kinds here too.
export const PUSH_KINDS: PushKind[] = [
  { field: "reminders", path: "/push/reminders", label: "Check-in reminders" },
  { field: "likeAlerts", path: "/push/likes", label: "When someone likes your check-in" },
  { field: "squadAlerts", path: "/push/squads", label: "When someone in your squads checks in" },
];

type Mode = "ask" | "blocked" | "kinds";
export function PushPrompt({ me, path, onChanged }: { me: Me; path: string; onChanged?: () => Promise<void> | void }) {
  const { t } = useVoice();
  const [mode, setMode] = useState<Mode | null>(null);
  const open = mode !== null;
  const setOpen = (on: false) => !on && setMode(null);
  const kindsOff = PUSH_KINDS.filter((k) => !me[k.field]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const ready = path === "/" && me.points > 0;
  useEffect(() => {
    if (!ready || open) return;
    let cancelled = false;
    // A short wait so it doesn't land on top of the "Checked in" toast straight away.
    const timer = setTimeout(() => {
      pushState()
        .then((state) => {
          if (cancelled) return;
          if (shouldAskForPush(state)) setMode("ask");
          else if (shouldShowBlockedHelp(state)) setMode("blocked");
          else if (shouldAskAboutTypes(state, kindsOff.length)) setMode("kinds");
        })
        .catch(() => {});
    }, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready]);

  if (!open) return null;

  const notNow = () => {
    if (mode === "ask") {
      snoozePushAsk();
      markPushAsked();
    } else if (mode === "blocked") markBlockedHelpShown();
    else markTypesAsked();
    setOpen(false);
  };

  // Switch back on every kind they'd turned off.
  const turnKindsOn = async () => {
    setBusy(true);
    setNote(null);
    try {
      for (const kind of kindsOff) await api(kind.path, { method: "PUT", body: { on: true } });
      markTypesAsked();
      await onChanged?.();
      setOpen(false);
    } catch {
      setNote("That didn't work. You can switch them on in Settings.");
    }
    setBusy(false);
  };

  const bell = (
    <div className="push-bell" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    </div>
  );

  if (mode === "blocked") {
    return (
      <div className="sheet-backdrop" onClick={notNow}>
        <div className="sheet stack-sm" role="dialog" aria-modal="true" aria-label="Notifications are blocked" onClick={(e) => e.stopPropagation()}>
          {bell}
          <h2 className="section-title">Notifications are blocked</h2>
          <p className="small muted no-margin">
            Your phone is blocking notifications from Crunchd, so you won't hear about likes, your squads or reminders. To
            get them, allow notifications for Crunchd in your phone's settings, then open Settings here.
          </p>
          <button type="button" className="button" onClick={notNow}>
            OK
          </button>
        </div>
      </div>
    );
  }

  if (mode === "kinds") {
    return (
      <div className="sheet-backdrop" onClick={busy ? undefined : notNow}>
        <div className="sheet stack-sm" role="dialog" aria-modal="true" aria-label="Turn these back on?" onClick={(e) => e.stopPropagation()}>
          {bell}
          <h2 className="section-title">Turn these back on?</h2>
          <p className="small muted no-margin">You've switched off some notifications:</p>
          <ul className="small no-margin">
            {kindsOff.map((k) => (
              <li key={k.field}>{k.label}</li>
            ))}
          </ul>
          {note && <p className="small no-margin">{note}</p>}
          <button type="button" className="button big" disabled={busy} onClick={turnKindsOn}>
            {busy ? "Turning on…" : "Turn them on"}
          </button>
          <button type="button" className="link-button" disabled={busy} onClick={notNow}>
            Keep as they are
          </button>
        </div>
      </div>
    );
  }

  const turnOn = async () => {
    setBusy(true);
    setNote(null);
    try {
      // This is where the phone shows its own "Allow notifications?" prompt.
      const state = await turnOnPush();
      markPushAsked();
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
        {bell}
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
