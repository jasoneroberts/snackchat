// "Add to home screen" helpers for the welcome page.
//
// Chrome on Android (and desktop) fires `beforeinstallprompt` once, early,
// when the app can be installed. We keep it so a button can show the real
// install prompt later. iPhones never fire it: there you use Safari's Share
// menu, so we show those steps instead.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); // we'll show it from our own button
  deferred = e as InstallPromptEvent;
  listeners.forEach((fn) => fn());
});

/** Call fn when the install prompt becomes available. Returns an unsubscribe. */
export function onInstallReady(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const canPromptInstall = () => deferred !== null;

/** Show the browser's own install prompt. True if they installed. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null; // each event can only be used once
  await event.prompt();
  return (await event.userChoice).outcome === "accepted";
}

/** Already opened from the home screen? */
export function isInstalled(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export type Platform = "ios" | "android" | "other";

export function platform(ua = navigator.userAgent): Platform {
  // iPads say they're Macs now; a Mac with a touch screen is an iPad.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

// The welcome page shows once per device: adding to the home screen is per device too.
const WELCOMED = "snackchat.welcomed";

export function welcomed(): boolean {
  try {
    return localStorage.getItem(WELCOMED) === "1";
  } catch {
    return true; // storage blocked: don't nag on every visit
  }
}

export function markWelcomed() {
  try {
    localStorage.setItem(WELCOMED, "1");
  } catch {
    // Storage blocked: they'll just not see it again this visit.
  }
}
