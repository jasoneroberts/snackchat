// Push notifications on this phone (check-in reminders, and admin alerts). The browser makes
// a "subscription" (an address at Apple's, Google's or Mozilla's push
// service plus keys) and the server keeps it to send messages to.
import { api } from "../api";
import { recall, remember, TURNED_OFF, type PushState } from "./pushAsk";

export type { PushState };

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
  remember(TURNED_OFF, null);
  return subscribe();
}

// Make (or reuse) this phone's subscription and tell the server about it.
async function subscribe(): Promise<PushState> {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string }>("/push/key");
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(publicKey) }));
  await api("/push", { method: "PUT", body: sub.toJSON() as Record<string, unknown> });
  return "on";
}

export async function turnOffPush(): Promise<PushState> {
  remember(TURNED_OFF, "1"); // so keepPushOn() leaves it off
  const sub = await currentSubscription();
  if (sub) {
    await api("/push", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  }
  return "off";
}

/**
 * Run once when the app opens. If they've already said yes on this phone,
 * make sure the subscription exists and the server has it under this
 * account (it re-sends it each open, which also fixes it after someone else
 * signs in on the same phone, or after the push service changed the address).
 */
export async function keepPushOn(): Promise<void> {
  if (!supported() || Notification.permission !== "granted" || recall(TURNED_OFF)) return;
  await subscribe();
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
