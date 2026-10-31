// The preview card WhatsApp, iMessage, Instagram and the rest show when a
// Crunchd link is pasted into a chat. Their link checkers read the page's
// <head> without running any JavaScript, so the React app can't set these
// tags itself. Instead the Worker rewrites index.html on the way out:
// - every page gets the general Crunchd card (the tags in index.html);
// - a squad invite (/join/<code>) gets its own: "Join Roberts snacks on
//   Crunchd", with how many people are in it.
// The picture is the same /og-image.png (1200 × 630) for both.

import { normaliseCode } from "./groups";

export interface Preview {
  title: string;
  description: string;
  url: string;
  image: string;
}

/** "/join/ab12cd" → "AB12CD", anything else → null. */
export function inviteCodeFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/join\/([^/]+)\/?$/);
  if (!m) return null;
  const code = normaliseCode(decodeURIComponent(m[1]));
  return code.length >= 4 && code.length <= 12 ? code : null;
}

/** The card for a squad invite. Says "squad" for everyone, since it's what invites are called in chats. */
export function invitePreview(group: { name: string; members: number }, origin: string, url: string): Preview {
  const people = group.members === 1 ? "1 person is" : `${group.members} people are`;
  return {
    title: `Join ${group.name} on Crunchd`,
    description: `${people} rating snacks in ${group.name}. Join the squad, check in what you're eating and see who tops the table.`,
    url,
    image: `${origin}/og-image.png`,
  };
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The <meta> tags for a card, with every value escaped (squad names are typed by people). */
export function previewTags(p: Preview): string {
  const tags: [string, string, string][] = [
    ["name", "description", p.description],
    ["property", "og:type", "website"],
    ["property", "og:site_name", "Crunchd"],
    ["property", "og:title", p.title],
    ["property", "og:description", p.description],
    ["property", "og:url", p.url],
    ["property", "og:image", p.image],
    ["property", "og:image:width", "1200"],
    ["property", "og:image:height", "630"],
    ["property", "og:image:alt", "Crunchd: rate your snacks with your mates"],
    ["name", "twitter:card", "summary_large_image"],
  ];
  return tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escape(value)}" />`).join("\n");
}

/**
 * For a squad invite page, swaps index.html's general card for the squad's
 * own. Other pages, unknown codes and anything that isn't HTML pass through.
 */
export async function withInvitePreview(request: Request, page: Response, db: D1Database): Promise<Response> {
  const url = new URL(request.url);
  const code = inviteCodeFromPath(url.pathname);
  if (!code || !(page.headers.get("Content-Type") ?? "").includes("text/html")) return page;
  const group = await db
    .prepare("SELECT g.name, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS members FROM groups g WHERE g.invite_code = ?")
    .bind(code)
    .first<{ name: string; members: number }>()
    .catch(() => null);
  if (!group) return page;
  const preview = invitePreview(group, url.origin, `${url.origin}/join/${code}`);
  const remove = { element: (el: Element) => void el.remove() };
  return new HTMLRewriter()
    .on('meta[property^="og:"]', remove)
    .on('meta[name^="twitter:"]', remove)
    .on('meta[name="description"]', remove)
    .on("title", { element: (el) => void el.setInnerContent(preview.title) })
    .on("head", { element: (el) => void el.append(previewTags(preview), { html: true }) })
    .transform(page);
}
