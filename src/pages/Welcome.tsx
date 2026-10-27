import { useEffect, useState } from "react";
import type { Me } from "../api";
import { canPromptInstall, isInstalled, onInstallReady, platform, promptInstall } from "../lib/install";
import { useVoice } from "../lib/voice";

/**
 * Shown once on each device after someone joins (and from Settings): what
 * Crunchd is for, and how to put it on the home screen so it opens like an
 * app. `onDone` closes it.
 */
export function Welcome({ me, onDone }: { me: Me; onDone: () => void }) {
  const { t } = useVoice();
  const [installReady, setInstallReady] = useState(canPromptInstall);
  const [installed, setInstalled] = useState(isInstalled);
  const os = platform();

  useEffect(() => onInstallReady(() => setInstallReady(true)), []);

  const install = async () => {
    if (await promptInstall()) setInstalled(true);
    setInstallReady(canPromptInstall());
  };

  return (
    <div className="page stack welcome">
      <div className="welcome-head">
        <img src={me.voice === "lad" ? "/logo-lad.svg" : "/logo.svg"} alt="" width={72} height={72} />
        <h1 className="title">Welcome, {me.username}</h1>
        <p className="muted no-margin">Rate snacks, see what your mates are eating, and climb the boards.</p>
      </div>

      <ol className="card-plain welcome-steps">
        <li>
          <b>{t("title.checkin")}</b>
          <span className="small muted">Tap the orange + after you eat something. Rate it, add a photo for extra points.</span>
        </li>
        <li>
          <b>Join your group</b>
          <span className="small muted">Open the invite link you were sent, or start a group in Groups and share it.</span>
        </li>
        <li>
          <b>Explore</b>
          <span className="small muted">Say what you like in each type of snack and get suggestions to try next.</span>
        </li>
      </ol>

      <section className="card-plain stack-sm">
        <h2 className="section-title">Put Crunchd on your home screen</h2>
        {installed ? (
          <p className="small no-margin">You're all set: Crunchd is on your home screen.</p>
        ) : installReady ? (
          <>
            <p className="small muted no-margin">It opens full screen like an app, one tap away.</p>
            <button type="button" className="button" onClick={install}>
              Add to home screen
            </button>
          </>
        ) : os === "ios" ? (
          <ol className="small how-to">
            <li>
              Open this page in <b>Safari</b>.
            </li>
            <li>
              Tap the <b>Share</b> button <ShareIcon />. On newer iPhones it is inside the <b>⋯</b> menu.
            </li>
            <li>
              Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.
            </li>
          </ol>
        ) : os === "android" ? (
          <ol className="small how-to">
            <li>
              Open this page in <b>Chrome</b>.
            </li>
            <li>
              Tap the <b>⋮</b> menu at the top right.
            </li>
            <li>
              Tap <b>Add to Home screen</b> (or <b>Install app</b>), then <b>Add</b>.
            </li>
          </ol>
        ) : (
          <p className="small muted no-margin">
            Crunchd works best on your phone. Open this address there and add it to your home screen from the browser's
            menu.
          </p>
        )}
      </section>

      <button type="button" className="button big" onClick={onDone}>
        Let's go
      </button>
    </div>
  );
}

// Safari's share icon: a box with an arrow pointing up out of it.
function ShareIcon() {
  return (
    <svg className="inline-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
