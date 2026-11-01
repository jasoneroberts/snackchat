// Crunchd's service worker. It only handles push notifications (admin alerts
// for now): no offline caching, so a deploy is never hidden behind old files.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Crunchd", {
      body: data.body || "Something needs a look.",
      // The full-colour logo, shown beside the message.
      icon: "/icon-192.png",
      // The little icon in Android's status bar. Android only uses the
      // transparency of this picture and paints it white, so a full-colour
      // square icon came out as a plain white blob. This one is a white crisp
      // on a see-through background, so the crisp shape shows.
      badge: "/badge-96.png",
      // One notification per kind: a second new snack replaces the first, renotify buzzes again.
      tag: data.tag || "crunchd",
      renotify: true,
      data: { url: data.url || "/settings" },
    }),
  );
});

// Tapping a notification opens that page, in the app if it's already open.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.focus().then((w) => w.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
