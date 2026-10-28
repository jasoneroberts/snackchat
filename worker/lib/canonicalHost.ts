// The app lives at one address (CANONICAL_HOST in wrangler.jsonc, e.g.
// getcrunchd.com). Two other addresses still reach the same Worker:
//   - the old snackchat.<account>.workers.dev link people were sent before,
//   - www.getcrunchd.com, for anyone who types the www.
// Pages on those get a permanent (301) redirect to the same path on the real
// address. Preview links from Workers Builds (<version>-snackchat...workers.dev)
// are left alone so PR previews keep working.

const OLD_WORKER_PREFIX = "snackchat.";

/** Where this request should be sent instead, or null to serve it here. */
export function canonicalRedirect(url: URL, method: string, canonicalHost: string | undefined): string | null {
  if (!canonicalHost) return null;
  if (method !== "GET" && method !== "HEAD") return null;
  // API calls are left alone: a fetch() from a page still open on the old
  // address can't follow a redirect to another site (and would lose its
  // sign-in), so it keeps working until that page is next loaded.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return null;

  const host = url.hostname;
  const isOldWorker = host.startsWith(OLD_WORKER_PREFIX) && host.endsWith(".workers.dev");
  const isWww = host === `www.${canonicalHost}`;
  if (!isOldWorker && !isWww) return null;

  return `https://${canonicalHost}${url.pathname}${url.search}`;
}
