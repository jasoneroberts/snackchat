// Addresses for check-in photos. Small places ask for a small copy, which the
// Worker makes with Cloudflare Images (worker/lib/thumbs.ts): a few KB
// instead of a few hundred. The full-screen viewer still gets the original.

/** small: tiles and thumbnails (up to ~100px on screen). wide: the full-width picture on a snack page. */
export function photoUrl(id: string, size?: "small" | "wide"): string {
  const base = `/api/photos/${encodeURIComponent(id)}`;
  if (size === "small") return `${base}?w=320`;
  if (size === "wide") return `${base}?w=800`;
  return base;
}
