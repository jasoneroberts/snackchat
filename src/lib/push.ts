// Push notifications on this phone (check-in reminders, and admin alerts). The browser makes
// a "subscription" (an address at Apple's, Google's or Mozilla's push
// service plus keys) and the server keeps it to send messages to.
import { api } from "../api";

export type PushState = "unsupported" | "needs-install" | "blocked" | "off" | "on";

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// iPhones only allow push for apps added to the home screen.
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const installed = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

export function registerServiceWorker(): void {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIos() && !installed() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return (await currentSubscription()) ? "on" : "off";
}

export async function turnOnPush(): Promise<PushState> {
  if ((await Notification.requestPermission()) !== "granted") return "blocked";
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string }>("/push/key");
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(publicKey) });
  await api("/push", { method: "PUT", body: sub.toJSON() as Record<string, unknown> });
  return "on";
}

export async function turnOffPush(): Promise<PushState> {
  const sub = await currentSubscription();
  if (sub) {
    await api("/push", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  }
  return "off";
}

function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
  return Uint8Array.from(s, (ch) => ch.charCodeAt(0));
}

/** The number on the app icon (where the phone supports it). */
export function setIconBadge(count: number): void {
  const nav = navigator as { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (count > 0) nav.setAppBadge?.(count).catch(() => {});
  else nav.clearAppBadge?.().catch(() => {});
}
