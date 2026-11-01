// Crunchd's service worker. It does two jobs:
//
// 1. Push notifications (check-in reminders, likes, squad alerts, admin alerts).
// 2. Opening instantly, even on a weak signal or none at all. It keeps a copy
//    of the app itself (index.html and the built files in /assets/) on the
//    phone, so opening Crunchd from the home screen doesn't wait for the
//    network. Data (anything under /api/) is never stored here: it always
//    comes fresh from the server.
//
// How new versions arrive (no stale app after a deploy):
// - Each open shows the copy on the phone straight away, and at the same time
//   asks the server for the latest index.html.
// - If it changed (a deploy happened), every file the new version needs is
//   downloaded first, and only then is the new index.html stored. So the copy
//   on the phone is always a complete, matching set: never new HTML pointing
//   at files that aren't there yet.
// - The page is told "a new version is ready", and the next tap on a link
//   loads it (src/lib/appUpdate.ts). Worst case, it shows on the next open.
//
// Escape hatch: if caching ever goes wrong, bump VERSION below and deploy.
// The browser checks this file for changes on every open, and the new one
// deletes every old cache when it takes over.

const VERSION = "v1";
const SHELL_CACHE = `crunchd-shell-${VERSION}`; // index.html, plus the list of files each version needs
const FILES_CACHE = `crunchd-files-${VERSION}`; // /assets/* and the icons
const SHELL_URL = "/";
const VERSIONS_URL = "/__crunchd/versions"; // not a real address: a note kept in the cache

// Built files have a content hash in their name (index-8Qq3de04.js), so a name
// always means the same bytes and they can be kept forever.
const BUILT_FILE = /\/assets\/[\w.-]+\.(?:js|css|woff2?|png|svg|jpe?g|webp)/g;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // Download the app straight away, so even the second open is instant.
  event.waitUntil(refreshShell().catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, FILES_CACHE]);
      for (const name of await caches.keys()) {
        if (name.startsWith("crunchd-") && !keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

/** Only the app's real address uses the copy on the phone. */
function usesCache(url) {
  if (url.origin !== self.location.origin) return false;
  // The old snackchat.….workers.dev address must keep reaching the Worker so it
  // can redirect people to getcrunchd.com, and pull request previews live
  // there too: neither should be answered from a copy.
  if (url.hostname.endsWith(".workers.dev")) return false;
  return true;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!usesCache(url)) return;
  // Data and pictures from the API: straight to the network, as before.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(openApp(event));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(builtFile(request));
  } else if (/\.(?:svg|png|webmanifest)$/.test(url.pathname)) {
    event.respondWith(staticFile(event));
  }
});

// Opening the app (any page: /, /boards, /snack/…). Every page is the same
// index.html; the app then picks what to show from the address.
async function openApp(event) {
  const cached = await caches.open(SHELL_CACHE).then((c) => c.match(SHELL_URL, { ignoreVary: true }));
  if (cached) {
    // Show the copy now; check for a new version in the background.
    event.waitUntil(refreshShell().catch(() => {}));
    return cached;
  }
  // First ever open (or the copy was cleared): use the network as normal.
  try {
    const response = await fetch(event.request);
    event.waitUntil(refreshShell().catch(() => {}));
    return response;
  } catch {
    return new Response(offlinePage, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

// Hashed files: from the phone if there, else the network (and keep a copy).
async function builtFile(request) {
  const cache = await caches.open(FILES_CACHE);
  const cached = await cache.match(request, MATCH);
  if (cached) return cached;
  const response = await fetch(request);
  if (isBuiltFile(response)) await cache.put(request, response.clone());
  return response;
}

// ignoreVary: the server says "Vary: Accept-Encoding" and the like, and a
// script tag asks with different headers than the background download did.
// The file is the same either way (its name is its content).
const MATCH = { ignoreSearch: true, ignoreVary: true };

// A file that's gone (an old version after a deploy) comes back as the app's
// index.html with "200 OK" (any unknown address does, so the app's own pages
// work). That must never be kept under a script's name.
const isBuiltFile = (response) => response.ok && !(response.headers.get("Content-Type") || "").includes("text/html");

// Icons, logos and the manifest keep their names when they change, so show
// the copy and quietly fetch a fresh one for next time.
async function staticFile(event) {
  const cache = await caches.open(FILES_CACHE);
  const cached = await cache.match(event.request, { ignoreVary: true });
  const fresh = fetch(event.request).then(async (response) => {
    if (isBuiltFile(response)) await cache.put(event.request, response.clone());
    return response;
  });
  if (cached) {
    event.waitUntil(fresh.catch(() => {}));
    return cached;
  }
  return fresh;
}

let refreshing = null;
let lastRefresh = 0;

/** Fetch the latest index.html and, if it's new, everything it needs. */
function refreshShell() {
  // Several opens in a row share one check, and checks are at least 10 s apart.
  if (refreshing) return refreshing;
  if (Date.now() - lastRefresh < 10_000) return Promise.resolve();
  refreshing = doRefresh().finally(() => {
    refreshing = null;
    lastRefresh = Date.now();
  });
  return refreshing;
}

async function doRefresh() {
  const shell = await caches.open(SHELL_CACHE);
  const response = await fetch(SHELL_URL, { cache: "no-cache", credentials: "same-origin" });
  if (!response.ok || !(response.headers.get("Content-Type") || "").includes("text/html")) return;
  const html = await response.text();
  // A development server's index.html points at /src/main.tsx, not /assets/:
  // nothing to keep then, so `npm run dev` always shows the live code.
  if (!html.includes("/assets/")) return;

  const old = await shell.match(SHELL_URL, { ignoreVary: true });
  const oldHtml = old ? await old.text() : null;
  if (oldHtml === html) return; // same version as the copy we have

  // A new version: download every file it needs before switching to it.
  const files = await caches.open(FILES_CACHE);
  const needed = await filesFor(html, files);

  const versions = await readVersions(shell);
  await shell.put(
    SHELL_URL,
    new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
  );
  // Keep this version's files and the one before (a page still open on the
  // old version may yet load one of its parts); drop anything older.
  const keep = new Set([...needed, ...(versions.current || [])]);
  await shell.put(VERSIONS_URL, Response.json({ current: [...needed], previous: versions.current || [] }));
  for (const request of await files.keys()) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/assets/") && !keep.has(path)) await files.delete(request);
  }

  // Tell open pages, so the next tap loads the new version (src/lib/appUpdate.ts).
  if (oldHtml !== null) {
    for (const client of await self.clients.matchAll({ type: "window" })) client.postMessage({ type: "crunchd-updated" });
  }
}

/**
 * Every built file a version uses: the ones index.html names, plus the ones
 * named inside its scripts and styles (pages that load later, the font).
 * Each is downloaded into the cache if it isn't there already.
 */
async function filesFor(html, files) {
  const found = new Set();
  const queue = [...new Set(html.match(BUILT_FILE) || [])];
  while (queue.length) {
    const path = queue.shift();
    if (found.has(path)) continue;
    found.add(path);
    let response = await files.match(path, MATCH);
    if (!response) {
      response = await fetch(path);
      // A missing file means a half-finished deploy: give up and try again on the next open.
      if (!isBuiltFile(response)) throw new Error(`${path}: ${response.status}`);
      await files.put(path, response.clone());
    }
    if (/\.(?:js|css)$/.test(path)) {
      const text = await response.text();
      for (const match of text.match(/assets\/[\w.-]+\.(?:js|css|woff2?|png|svg|jpe?g|webp)/g) || []) {
        const next = `/${match}`;
        if (!found.has(next)) queue.push(next);
      }
    }
  }
  return found;
}

async function readVersions(shell) {
  try {
    const res = await shell.match(VERSIONS_URL);
    return res ? await res.json() : {};
  } catch {
    return {};
  }
}

// Shown only if the very first open happens with no signal at all.
const offlinePage = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Crunchd</title>
<style>body{font-family:system-ui,sans-serif;background:#FFF4E0;color:#3a2a1a;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:16px}
button{font:inherit;font-weight:700;background:#F28C28;color:#fff;border:0;border-radius:999px;padding:12px 24px}</style></head>
<body><div><h1>No signal</h1><p>Crunchd needs the internet the first time it opens.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`;

// ---------------------------------------------------------------- push

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
      icon: "/icon-192.png",
      badge: "/icon-192.png",
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
