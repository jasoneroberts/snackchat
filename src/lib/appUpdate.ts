// When a new version of Crunchd has been deployed, the service worker
// (public/sw.js) downloads it in the background and says so with a
// "crunchd-updated" message. Rather than reloading under someone's thumb
// (and losing a half-written check-in), the next tap on a link does a full
// page load instead of an in-app page change, which picks up the new version.
// It looks exactly like a normal tap, just with the new code behind it.

let updateReady = false;

export function listenForUpdates(): void {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    if ((event.data as { type?: string } | null)?.type === "crunchd-updated") updateReady = true;
  });
}

/** True once a new version is downloaded and waiting for the next page change. */
export const newVersionReady = () => updateReady;
