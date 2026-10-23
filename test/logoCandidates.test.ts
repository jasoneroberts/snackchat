import { describe, expect, it } from "vitest";
import { commonsUrl, findLogoCandidates, isLogoHost, rankCandidates, readEntities } from "../worker/lib/logoCandidates";

// A trimmed-down Wikidata wbgetentities response.
const claim = (value: string) => [{ mainsnak: { datavalue: { value } } }];
const ENTITIES = {
  entities: {
    Q1: { labels: { en: { value: "Walkers" } }, descriptions: { en: { value: "surname" } }, claims: {} },
    Q2: {
      labels: { en: { value: "Walkers" } },
      descriptions: { en: { value: "British snack food manufacturer" } },
      claims: { P154: claim("Walkers logo.svg"), P856: claim("https://www.walkers.co.uk/") },
    },
    Q3: {
      labels: { en: { value: "Walkers Shortbread" } },
      descriptions: { en: { value: "Scottish bakery" } },
      claims: { P154: claim("Walkers Shortbread.png") },
    },
    Q4: {
      labels: { en: { value: "Walker Art Center" } },
      descriptions: { en: { value: "museum in Minneapolis" } },
      claims: { P154: claim("Walker Art Center logo.svg"), P856: claim("https://walkerart.org") },
    },
  },
};
const IDS = ["Q1", "Q4", "Q2", "Q3"];

describe("logo candidates", () => {
  const ranked = rankCandidates(readEntities(IDS, ENTITIES));

  it("puts food companies' Wikidata logos first, then other logos, then website icons", () => {
    expect(ranked.map((c) => c.label)).toEqual([
      "Walkers: British snack food manufacturer",
      "Walkers Shortbread: Scottish bakery",
      "Walker Art Center: museum in Minneapolis",
      "Walkers: British snack food manufacturer (website icon)",
      "Walker Art Center: museum in Minneapolis (website icon)",
    ]);
  });

  it("asks Commons for a PNG of the logo file and Google for the site icon", () => {
    expect(ranked[0].url).toBe(commonsUrl("Walkers logo.svg"));
    expect(ranked[0].url).toBe("https://commons.wikimedia.org/wiki/Special:FilePath/Walkers_logo.svg?width=256");
    expect(ranked[3].url).toBe("https://www.google.com/s2/favicons?domain=www.walkers.co.uk&sz=256");
  });

  it("only downloads approved logos from the expected hosts", () => {
    for (const c of ranked) expect(isLogoHost(c.url)).toBe(true);
    expect(isLogoHost("https://upload.wikimedia.org/x.png")).toBe(true);
    expect(isLogoHost("https://evil.example/logo.png")).toBe(false);
    expect(isLogoHost("http://commons.wikimedia.org/x")).toBe(false);
    expect(isLogoHost("not a url")).toBe(false);
  });

  it("searches Wikidata, then reads the matches", async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      const action = new URL(url).searchParams.get("action");
      const body = action === "wbsearchentities" ? { search: IDS.map((id) => ({ id })) } : ENTITIES;
      return new Response(JSON.stringify(body));
    }) as typeof fetch;
    const found = await findLogoCandidates("Walkers", fake);
    expect(found).toEqual(ranked);
    expect(new URL(calls[0]).searchParams.get("search")).toBe("Walkers");
    expect(new URL(calls[1]).searchParams.get("ids")).toBe("Q1|Q4|Q2|Q3");
  });

  it("finds nothing for an unknown brand", async () => {
    const fake = (async () => new Response(JSON.stringify({ search: [] }))) as unknown as typeof fetch;
    expect(await findLogoCandidates("Zzxq", fake)).toEqual([]);
  });
});
