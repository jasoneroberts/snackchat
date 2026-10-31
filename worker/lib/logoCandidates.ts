// Suggested maker logos. For a brand we gather "matches" (things in the world
// that might be this maker) and pull pictures from each:
//
//   - English Wikipedia, searched for the brand plus what it makes ("Smiths
//     crisps"), which finds the right article far more often than the bare
//     name ("Smiths" is a band, a museum and a surname). The article's lead
//     picture is often the logo, and Wikipedia holds many UK brand logos that
//     aren't free enough for Wikimedia Commons, so Wikidata doesn't have them.
//   - Wikidata (the database behind Wikipedia): the "logo image" (P154) and
//     "official website" (P856) of each Wikipedia match, plus a plain name
//     search as a fallback.
//   - The maker's website: the home-screen icon it gives phones
//     (apple-touch-icon, usually a clean 180px square) and Google's copy of
//     its site icon.
//   - Guessed websites (walkers.co.uk, walkerscrisps.com...) for makers
//     nothing else knows about, shown last.
//
// Each match is scored on how well its name fits the brand and whether it
// sounds like a food company; each picture adds a bonus for how logo-like its
// source is. Best first. An admin picks one; the rest can be rejected.

export type LogoSource = "alias" | "wikidata" | "wikipedia" | "website" | "guess";

export interface LogoCandidate {
  url: string; // where to fetch the image (PNG/JPEG/WebP), also used to preview it
  source: LogoSource;
  label: string; // what it is, for the admin: "Walkers: British snack food brand"
  score?: number; // higher is better; only used for ordering
}

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
// Wikimedia asks for a descriptive User-Agent on API calls.
const USER_AGENT = "Crunchd/1.0 (https://getcrunchd.com; logo suggestions)";

/**
 * Wikimedia Commons serves any logo file (SVG too) as a PNG at this width.
 * Commons only makes thumbnails at its standard widths (120, 250, 330, 500...)
 * and refuses others, so this must stay one of those.
 */
export const commonsUrl = (file: string, width = 250) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, "_"))}?width=${width}`;

/** A site's icon at up to 256px, from Google's favicon service. */
export const websiteIconUrl = (site: string) => {
  const host = new URL(site).hostname;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=256`;
};

// Name matching --------------------------------------------------------------

/** "McVitie's" → "mcvities", "Mr. Porky" → "mr porky", "Nerds (candy)" → "nerds". */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/['’`.]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * How well a name fits the brand: 3 exact ("Smith's" for smiths), 2 starts
 * with it ("Smith's Snackfood Company"), 1 contains it as a word, or is the
 * start of it ("Kettle" for kettle krinkle), 0 not at all.
 */
export function nameScore(brand: string, name: string): number {
  const b = normName(brand);
  const n = normName(name);
  if (!b || !n) return 0;
  if (n === b || n.replace(/ /g, "") === b.replace(/ /g, "")) return 3;
  if (n.startsWith(`${b} `)) return 2;
  if (` ${n} `.includes(` ${b} `) || b.startsWith(`${n} `)) return 1;
  return 0;
}

const FOOD = /\b(snack|crisp|chip|food|confection|chocolate|biscuit|cookie|sweet|cand(y|ies)|nut|bakery|baked|cereal|popcorn|pretzel|scratching|crackers?|gum|jelly|toffee|fudge|lolly|lollies|treat|bar\b)/i;
const COMPANY = /\b(brand|company|manufacturer|maker|business|subsidiary|corporation|conglomerate|producer|division)/i;
const NOT_FOOD =
  /\b(city|town|village|commune|municipality|parish|river|lake|mountain|planet|god|band|album|song|single|film|novel|book|television|tv series|episode|footballer|football|club|team|museum|gallery|university|college|school|surname|given name|family name|politician|actor|actress|singer|rapper|musician|artist|people|ship|station|airport|county|district|region|disambiguation|species|genus|fictional|character|video game|software|bank|airline|hospital|church|journal|magazine|newspaper|podcast|website)\b/i;

/** Whether a description sounds like the right sort of company: +3 food, +1 company, −4 clearly not. */
export function foodScore(text: string): number {
  if (!text) return 0;
  if (FOOD.test(text)) return 3;
  if (NOT_FOOD.test(text)) return -4;
  return COMPANY.test(text) ? 1 : 0;
}

// Matches ----------------------------------------------------------------------

/** Something that might be the maker: a Wikipedia article and/or a Wikidata item. */
export interface Match {
  name: string;
  description: string;
  logoFile: string | null; // Wikidata logo, a file on Commons
  image: { url: string; file: string } | null; // Wikipedia article's lead picture
  website: string | null;
  fromWikipedia: boolean; // found by the brand + "crisps" search
}

export interface WikiPage {
  index: number;
  title: string;
  description?: string;
  pageimage?: string;
  thumbnail?: { source: string };
  pageprops?: { wikibase_item?: string };
}

/** Wikipedia search results, best first. */
export function readWikipedia(data: unknown): WikiPage[] {
  const pages = (data as { query?: { pages?: Record<string, WikiPage> } })?.query?.pages ?? {};
  return Object.values(pages).sort((a, b) => a.index - b.index);
}

interface Entity {
  id: string;
  label: string;
  description: string;
  logo: string | null; // Commons file name
  website: string | null;
}

/** The useful parts of a Wikidata wbgetentities response, in the order asked for. */
export function readEntities(ids: string[], data: unknown): Entity[] {
  const entities = (data as { entities?: Record<string, any> })?.entities ?? {};
  return ids.flatMap((id) => {
    const e = entities[id];
    if (!e || e.missing !== undefined) return [];
    const claim = (p: string): string | null => e.claims?.[p]?.[0]?.mainsnak?.datavalue?.value ?? null;
    const website = claim("P856");
    const logo = claim("P154");
    return [
      {
        id,
        label: e.labels?.en?.value ?? id,
        description: e.descriptions?.en?.value ?? "",
        logo: typeof logo === "string" ? logo : null,
        website: typeof website === "string" && /^https?:\/\//.test(website) ? website : null,
      },
    ];
  });
}

/** Wikipedia articles joined to their Wikidata items, then Wikidata-only items. */
export function buildMatches(pages: WikiPage[], entities: Entity[]): Match[] {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const used = new Set<string>();
  const out: Match[] = pages.map((p) => {
    const id = p.pageprops?.wikibase_item;
    const e = id ? byId.get(id) : undefined;
    if (id) used.add(id);
    return {
      name: p.title,
      // Wikipedia's short description ("British crisp brand") is usually the best one.
      description: p.description || e?.description || "",
      logoFile: e?.logo ?? null,
      image: p.thumbnail?.source && p.pageimage ? { url: p.thumbnail.source, file: p.pageimage } : null,
      website: e?.website ?? null,
      fromWikipedia: true,
    };
  });
  for (const e of entities) {
    if (used.has(e.id)) continue;
    out.push({ name: e.label, description: e.description, logoFile: e.logo, image: null, website: e.website, fromWikipedia: false });
  }
  return out;
}

/** How likely a match is to be this maker; 0 or less means leave it out. */
export function matchScore(brand: string, m: Match): number {
  const name = nameScore(brand, m.name);
  // Wikipedia titles carry hints in brackets: "Walkers (snack foods)".
  const food = foodScore(`${m.description} ${m.name.match(/\(([^)]*)\)/)?.[1] ?? ""}`);
  // A food company with a different name (Walkers, when looking for Barcel) is
  // someone else's logo, however well it fits.
  if (name === 0) return 0;
  return name * 2 + food + (m.fromWikipedia ? 1 : 0);
}

// Sources -------------------------------------------------------------------------

/** Home-screen and large site icons a page's HTML points to, best first. */
export function readSiteIcons(html: string, pageUrl: string): string[] {
  const found: { url: string; rank: number }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? "";
    const rel = attr("rel").toLowerCase();
    const href = attr("href");
    if (!href || /\.(ico|svg)(\?|$)/i.test(href)) continue;
    const size = Math.max(0, ...attr("sizes").split(/\s+/).map((s) => parseInt(s, 10) || 0));
    let rank = 0;
    if (rel.includes("apple-touch-icon")) rank = 2 + Math.min(size, 512) / 1000;
    else if (/\bicon\b/.test(rel) && size >= 96) rank = 1 + Math.min(size, 512) / 1000;
    if (!rank) continue;
    try {
      const url = new URL(href, pageUrl);
      if (url.protocol === "https:") found.push({ url: url.href, rank });
    } catch {
      // not a usable address
    }
  }
  return found.sort((a, b) => b.rank - a.rank).map((f) => f.url);
}

/** Websites a maker might have, for when nothing else knows: walkers.co.uk, walkerscrisps.com... */
export function guessSites(brand: string, context: string | null): string[] {
  const slug = normName(brand).replace(/ /g, "");
  if (!slug || slug.length < 3) return [];
  const word = context?.split(" ")[0]; // "crisps", "chocolate", "pub"...
  const names = [slug, ...(word && word !== "pub" ? [`${slug}${word}`] : []), `${slug}snacks`];
  return names.flatMap((n) => [`https://${n}.co.uk/`, `https://${n}.com/`]);
}

/** Every picture the matches offer, scored, best first, without duplicates. */
export function rankCandidates(brand: string, matches: Match[], siteIcons: Map<string, string[]> = new Map()): LogoCandidate[] {
  const out: LogoCandidate[] = [];
  const describe = (m: Match) => (m.description ? `${m.name}: ${m.description}` : m.name);
  for (const m of matches) {
    const score = matchScore(brand, m);
    if (score <= 0) continue;
    if (m.logoFile) out.push({ url: commonsUrl(m.logoFile), source: "wikidata", label: describe(m), score: score + 3 });
    if (m.image) {
      // A lead picture named "...logo..." is the logo; otherwise it's often a packet or a factory.
      const logoish = /logo|wordmark/i.test(m.image.file);
      out.push({
        url: m.image.url,
        source: "wikipedia",
        label: `${describe(m)} (${logoish ? "logo" : "picture"} from Wikipedia)`,
        score: score + (logoish ? 3 : -1),
      });
    }
    if (m.website) {
      for (const icon of siteIcons.get(m.website) ?? []) {
        out.push({ url: icon, source: "website", label: `${describe(m)} (app icon from ${new URL(m.website).hostname})`, score: score + 1 });
      }
      out.push({ url: websiteIconUrl(m.website), source: "website", label: `${describe(m)} (website icon)`, score });
    }
  }
  out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  // The same logo file can come from Wikidata and Wikipedia; keep the first.
  const fileOf = (c: LogoCandidate) =>
    c.source === "wikidata" || c.source === "wikipedia"
      ? decodeURIComponent(c.url.split("?")[0].split("/").pop() ?? "").replace(/^\d+px-/, "").replace(/\.png$/i, "").replace(/ /g, "_").toLowerCase()
      : c.url;
  const seen = new Set<string>();
  return out.filter((c) => {
    const key = fileOf(c);
    return !seen.has(key) && seen.add(key) && seen.add(c.url);
  });
}

const timeout = (ms: number) => (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(ms) : undefined);

/**
 * Look a brand up and return its logo candidates, best first. `context` is
 * what the maker mostly makes ("crisps"), to steer the Wikipedia search.
 */
export async function findLogoCandidates(brand: string, context: string | null = null, fetcher: typeof fetch = fetch): Promise<LogoCandidate[]> {
  const getJson = async (api: string, params: Record<string, string>) => {
    const res = await fetcher(`${api}?${new URLSearchParams({ ...params, format: "json", origin: "*" })}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: timeout(8000),
    });
    if (!res.ok) throw new Error(`${api} said ${res.status}`);
    return res.json();
  };

  // 1. Wikipedia (brand + what it makes) and Wikidata (bare name), side by side.
  const [wiki, search] = await Promise.allSettled([
    getJson(WIKIPEDIA_API, {
      action: "query",
      generator: "search",
      gsrsearch: context ? `${brand} ${context}` : brand,
      gsrlimit: "8",
      prop: "pageimages|pageprops|description",
      piprop: "thumbnail|name",
      pithumbsize: "250",
      pilicense: "any", // include non-free logos, which is most UK brand logos
      ppprop: "wikibase_item",
    }),
    getJson(WIKIDATA_API, { action: "wbsearchentities", search: brand, language: "en", type: "item", limit: "10" }),
  ]);
  if (wiki.status === "rejected" && search.status === "rejected") throw wiki.reason;
  const pages = wiki.status === "fulfilled" ? readWikipedia(wiki.value) : [];
  const searchIds = search.status === "fulfilled" ? ((search.value as { search?: { id: string }[] }).search ?? []).map((s) => s.id) : [];

  // 2. Logos and websites for all of them from Wikidata.
  const ids = [...new Set([...pages.flatMap((p) => p.pageprops?.wikibase_item ?? []), ...searchIds])].slice(0, 50);
  const entities = ids.length
    ? await getJson(WIKIDATA_API, { action: "wbgetentities", ids: ids.join("|"), props: "claims|labels|descriptions", languages: "en" })
        .then((data) => readEntities(ids, data))
        .catch(() => [])
    : [];
  const matches = buildMatches(pages, entities);

  // 3. Home-screen icons from the websites of the three likeliest makers.
  const sites = [
    ...new Set(
      matches
        .map((m) => ({ m, s: matchScore(brand, m) }))
        .filter((x) => x.s > 0 && x.m.website)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.m.website!),
    ),
  ].slice(0, 3);
  const siteIcons = new Map(await Promise.all(sites.map(async (s) => [s, await fetchSiteIcons(s, fetcher)] as const)));

  const ranked = rankCandidates(brand, matches, siteIcons);

  // 4. Guessed websites last, for makers the encyclopaedias don't know.
  const known = new Set(ranked.map((c) => c.url));
  for (const site of guessSites(brand, context)) {
    const url = websiteIconUrl(site);
    if (!known.has(url)) ranked.push({ url, source: "guess", label: `Icon of ${new URL(site).hostname} (a guess at their website)`, score: -10 });
  }
  return ranked;
}

/** The big icons a website's home page offers, or none if it won't load. */
async function fetchSiteIcons(site: string, fetcher: typeof fetch): Promise<string[]> {
  try {
    const res = await fetcher(site, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, signal: timeout(5000) });
    if (!res.ok || !(res.headers.get("Content-Type") ?? "").includes("html")) return [];
    // Icons are in the <head>; don't read a huge page to the end.
    const html = (await res.text()).slice(0, 200_000);
    return readSiteIcons(html, res.url || site).slice(0, 2);
  } catch {
    return [];
  }
}

// Downloading ------------------------------------------------------------------------

// The browser shrinks an uploaded logo first; a fetched one must already be small.
export const MAX_LOGO_BYTES = 512 * 1024;
// No SVG: it can carry scripts, and logos are served from the app's own address.
export const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
// Smaller than this looks blurry on a phone (Google's 16px favicons, mostly).
export const MIN_LOGO_SIDE = 96;

/** Only plain https addresses with a real host name (no IPs, no localhost). */
export function isSafeLogoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
    const host = u.hostname;
    return host.includes(".") && !/^[\d.]+$/.test(host) && !host.startsWith("[") && !/(^|\.)(localhost|local|internal)$/.test(host);
  } catch {
    return false;
  }
}

/** Width and height from a PNG, JPEG or WebP header, or null if unreadable. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const b = bytes;
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u32be = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  // PNG: the IHDR chunk comes first.
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { width: u32be(16), height: u32be(20) };
  }
  // JPEG: walk the markers to the first "start of frame".
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: u16be(i + 5), width: u16be(i + 7) };
      }
      i += 2 + u16be(i + 2);
    }
    return null;
  }
  // WebP: RIFF....WEBP then a VP8 / VP8L / VP8X chunk.
  const tag = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (b.length >= 30 && tag(0, 4) === "RIFF" && tag(8, 4) === "WEBP") {
    const chunk = tag(12, 4);
    if (chunk === "VP8 ") return { width: ((b[27] << 8) | b[26]) & 0x3fff, height: ((b[29] << 8) | b[28]) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  }
  return null;
}

/**
 * Download a suggested logo and check it's usable: a safe https address
 * (after redirects too), a PNG/JPEG/WebP, not empty, not too big and not
 * tiny. Google's favicon service answers 404 with a grey globe when a site
 * has no icon, so a failed status counts as unusable too. Callers only pass
 * addresses from a brand's own suggestion list.
 */
export async function fetchLogo(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; body: ArrayBuffer; type: string } | { ok: false; reason: string }> {
  if (!isSafeLogoUrl(url)) return { ok: false, reason: "not an allowed address" };
  const res = await fetcher(url, { headers: { "User-Agent": USER_AGENT }, signal: timeout(8000) }).catch(() => null);
  if (!res) return { ok: false, reason: "couldn't connect" };
  if (!res.ok) return { ok: false, reason: `status ${res.status}` };
  if (!isSafeLogoUrl(res.url || url)) return { ok: false, reason: "redirected elsewhere" };
  const type = res.headers.get("Content-Type")?.split(";")[0].trim() ?? "";
  if (!LOGO_TYPES.has(type)) return { ok: false, reason: `type ${type || "unknown"}` };
  const length = Number(res.headers.get("Content-Length") ?? 0);
  if (length > MAX_LOGO_BYTES) return { ok: false, reason: "too big" };
  const body = await res.arrayBuffer();
  if (body.byteLength === 0) return { ok: false, reason: "empty" };
  if (body.byteLength > MAX_LOGO_BYTES) return { ok: false, reason: "too big" };
  const size = imageSize(new Uint8Array(body, 0, Math.min(body.byteLength, 64 * 1024)));
  if (size && Math.max(size.width, size.height) < MIN_LOGO_SIDE) return { ok: false, reason: `too small (${size.width}×${size.height})` };
  return { ok: true, body, type };
}

// Logos the app already has --------------------------------------------------------

/**
 * Whether two brand names are probably the same maker written differently:
 * "KP" and "KP Snacks", "Kettle" and "Kettle Krinkle", "Smiths" and "Smith's".
 */
export function relatedBrands(a: string, b: string): boolean {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return false;
  return x === y || y.startsWith(`${x} `) || x.startsWith(`${y} `) || x.replace(/ /g, "") === y.replace(/ /g, "");
}
