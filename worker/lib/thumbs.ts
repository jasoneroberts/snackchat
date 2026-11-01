// Small copies of check-in photos for the places that show them small.
//
// Photos are stored up to 1600px wide (src/lib/image.ts), which is right for
// the full-screen viewer but far too big for a 64px tile in the feed: a
// phone would download ~300 KB to draw a thumbnail. With ?w=320 (tiles and
// thumbnails) or ?w=800 (the wide picture on a snack page), the Worker
// shrinks the photo with Cloudflare Images and serves a WebP of a few KB.
//
// - Only these two widths are allowed, so each photo is shrunk at most twice
//   (Cloudflare Images bills each different photo + size once a month; the
//   free allowance is 5,000).
// - The small copy is kept in Cloudflare's cache (Cache API), so repeat views
//   don't shrink it again. Nothing extra is stored in R2, so deleting a photo
//   needs no extra step.
// - Who may see the photo is checked before any of this (routes/photos.ts).
// - If Images isn't available or fails, the full photo is served instead:
//   the picture always shows, just bigger.

export const THUMB_WIDTHS = [320, 800] as const;
export type ThumbWidth = (typeof THUMB_WIDTHS)[number];

/** "?w=320" → 320; anything else (missing, other numbers) → null, meaning the full photo. */
export function thumbWidth(value: string | undefined): ThumbWidth | null {
  const n = Number(value);
  return (THUMB_WIDTHS as readonly number[]).includes(n) ? (n as ThumbWidth) : null;
}

/** The address the small copy is cached under. Not a real page: the Worker answers every request first. */
export const thumbCacheUrl = (origin: string, photoId: string, width: ThumbWidth) =>
  `${origin}/__thumbs/${encodeURIComponent(photoId)}/w${width}`;

// The browser keeps photos for a year (each photo id is never reused); the
// shared cache keeps the small copy for 30 days.
const BROWSER_CACHE = "private, max-age=31536000, immutable";
const SHARED_CACHE = "public, max-age=2592000";

/**
 * The small copy of an R2 photo: from the cache, else made now (and cached
 * for next time). Returns null if it can't be made, so the caller serves the
 * full photo instead.
 */
export async function thumbnail(
  images: ImagesBinding | undefined,
  photo: () => Promise<R2ObjectBody | null>,
  cacheUrl: string,
  width: ThumbWidth,
  waitUntil: (p: Promise<unknown>) => void,
): Promise<Response | null> {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const hit = await cache?.match(cacheUrl).catch(() => undefined);
  if (hit) return withBrowserCache(hit);
  if (!images) return null;

  const object = await photo();
  if (!object) return null;
  try {
    const result = await images
      .input(object.body)
      .transform({ width, fit: "scale-down" })
      .output({ format: "image/webp", quality: 80 });
    const made = result.response();
    const bytes = await made.arrayBuffer();
    const headers = { "Content-Type": made.headers.get("Content-Type") ?? "image/webp" };
    if (cache) {
      waitUntil(cache.put(cacheUrl, new Response(bytes, { headers: { ...headers, "Cache-Control": SHARED_CACHE } })).catch(() => {}));
    }
    return new Response(bytes, { headers: { ...headers, "Cache-Control": BROWSER_CACHE } });
  } catch (err) {
    console.warn("thumbnail failed, serving the full photo", err);
    return null;
  }
}

function withBrowserCache(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", BROWSER_CACHE);
  return new Response(res.body, { headers });
}
