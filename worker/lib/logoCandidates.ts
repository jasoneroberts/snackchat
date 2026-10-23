// Suggested maker logos. For a brand name we look it up on Wikidata (the
// database behind Wikipedia), which records many companies' logos as files on
// Wikimedia Commons, and their official websites. Candidates, best first:
//   1. Wikidata logos of matches that look like a food or snack company
//   2. Wikidata logos of any other match
//   3. The website icon of each match's official website
// An admin approves one or rejects it to see the next.

export interface LogoCandidate {
  url: string; // where to fetch the image (PNG/JPEG), also used to preview it
  source: "wikidata" | "website";
  label: string; // what it is, for the admin: "Walkers: British snack food brand"
}

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
// Wikimedia asks for a descriptive User-Agent on API calls.
const USER_AGENT = "Snackchat/1.0 (https://snackchat.jasoneroberts.workers.dev; logo suggestions)";

// Words in a Wikidata description that suggest the right sort of company.
const FOOD_WORDS = /\b(snack|crisp|chip|food|confection|chocolate|biscuit|sweet|candy|brand|nut|manufacturer|company|bakery|drink)/i;

/** Wikimedia Commons serves any logo file (SVG too) as a PNG at this width. */
export const commonsUrl = (file: string, width = 256) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, "_"))}?width=${width}`;

/** A site's icon at up to 256px, from Google's favicon service. */
export const websiteIconUrl = (site: string) => {
  const host = new URL(site).hostname;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=256`;
};

// Hosts the server will download an approved logo from (redirects included).
export const LOGO_HOSTS = ["commons.wikimedia.org", "upload.wikimedia.org", "www.google.com", "t0.gstatic.com", "t1.gstatic.com", "t2.gstatic.com", "t3.gstatic.com"];

export function isLogoHost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && LOGO_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

interface Entity {
  id: string;
  label: string;
  description: string;
  logo: string | null; // Commons file name
  website: string | null;
}

/** The useful parts of a Wikidata wbgetentities response, in search order. */
export function readEntities(ids: string[], data: unknown): Entity[] {
  const entities = (data as { entities?: Record<string, any> })?.entities ?? {};
  return ids.flatMap((id) => {
    const e = entities[id];
    if (!e || e.missing !== undefined) return [];
    const claim = (p: string): string | null => e.claims?.[p]?.[0]?.mainsnak?.datavalue?.value ?? null;
    const website = claim("P856");
    return [
      {
        id,
        label: e.labels?.en?.value ?? id,
        description: e.descriptions?.en?.value ?? "",
        logo: claim("P154"),
        website: typeof website === "string" && /^https?:\/\//.test(website) ? website : null,
      },
    ];
  });
}

/** Ordered candidates from Wikidata matches, without duplicates. */
export function rankCandidates(entities: Entity[]): LogoCandidate[] {
  const describe = (e: Entity) => (e.description ? `${e.label}: ${e.description}` : e.label);
  const foody = (e: Entity) => FOOD_WORDS.test(e.description);
  const withLogo = entities.filter((e) => e.logo);
  const out: LogoCandidate[] = [
    ...withLogo.filter(foody),
    ...withLogo.filter((e) => !foody(e)),
  ].map((e) => ({ url: commonsUrl(e.logo!), source: "wikidata" as const, label: describe(e) }));
  for (const e of [...entities.filter(foody), ...entities.filter((e) => !foody(e))]) {
    if (e.website) out.push({ url: websiteIconUrl(e.website), source: "website", label: `${describe(e)} (website icon)` });
  }
  const seen = new Set<string>();
  return out.filter((c) => !seen.has(c.url) && seen.add(c.url));
}

/** Look a brand up on Wikidata and return its logo candidates, best first. */
export async function findLogoCandidates(brand: string, fetcher: typeof fetch = fetch): Promise<LogoCandidate[]> {
  const get = async (params: Record<string, string>) => {
    const res = await fetcher(`${WIKIDATA_API}?${new URLSearchParams({ ...params, format: "json", origin: "*" })}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) throw new Error(`Wikidata said ${res.status}`);
    return res.json();
  };
  const search = (await get({ action: "wbsearchentities", search: brand, language: "en", type: "item", limit: "10" })) as {
    search?: { id: string }[];
  };
  const ids = (search.search ?? []).map((s) => s.id);
  if (!ids.length) return [];
  const data = await get({ action: "wbgetentities", ids: ids.join("|"), props: "claims|labels|descriptions", languages: "en" });
  return rankCandidates(readEntities(ids, data));
}
