// Little display helpers.

/** "just now", "5m", "3h", "2d", then a date like "14 Oct". */
export function timeAgo(unixSeconds: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor(now / 1000) - unixSeconds);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Up to two letters for an avatar: "jase" → "JA", "sam_k" → "SK". */
export function initials(username: string): string {
  const parts = username.split(/[_\d]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return username.slice(0, 2).toUpperCase();
}

const AVATAR_COLOURS = ["#F9C784", "#F6B8A8", "#CFE4F7", "#D9E6B8", "#F7C9DD", "#E9CFA3", "#D9B8A5", "#CDEBD3"];

/** The same person always gets the same avatar colour. */
export function avatarColour(username: string): string {
  let hash = 0;
  for (const ch of username.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLOURS[hash % AVATAR_COLOURS.length];
}

/** 4 → "4", 4.25 → "4.25", 3.5 → "3.5". */
export const rating = (n: number) => String(Math.round(n * 100) / 100);
