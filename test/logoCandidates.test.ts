import { describe, expect, it } from "vitest";
import {
  buildMatches,
  commonsUrl,
  fetchLogo,
  findLogoCandidates,
  foodScore,
  guessSites,
  imageSize,
  isSafeLogoUrl,
  matchScore,
  nameScore,
  normName,
  rankCandidates,
  readEntities,
  readSiteIcons,
  readWikipedia,
  relatedBrands,
} from "../worker/lib/logoCandidates";

// Trimmed-down Wikipedia (search + pageimages) and Wikidata (wbgetentities) answers.
const WIKI = {
  query: {
    pages: {
      "20": {
        index: 2,
        title: "The Smiths",
        description: "English rock band",
        pageimage: "The_Smiths_1985.jpg",
        thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/The_Smiths_1985.jpg/250px-The_Smiths_1985.jpg" },
        pageprops: { wikibase_item: "Q9" },
      },
      "10": {
        index: 1,
        title: "Smith's Snackfood Company",
        description: "British crisp manufacturer",
        pageimage: "Smiths_crisps_logo.png",
        thumbnail: { source: "https://upload.wikimedia.org/wikipedia/en/b/bb/Smiths_crisps_logo.png" },
        pageprops: { wikibase_item: "Q2" },
      },
      "30": { index: 3, title: "Walkers (snack foods)", description: "British snack food manufacturer", pageprops: { wikibase_item: "Q5" } },
    },
  },
};
const claim = (value: string) => [{ mainsnak: { datavalue: { value } } }];
const ENTITIES = {
  entities: {
    Q2: {
      labels: { en: { value: "Smith's" } },
      descriptions: { en: { value: "crisp brand" } },
      claims: { P154: claim("Smiths logo.svg"), P856: claim("https://www.smiths-crisps.co.uk/") },
    },
    Q5: { labels: { en: { value: "Walkers" } }, descriptions: { en: { value: "snack brand" } }, claims: { P154: claim("Walkers logo.svg") } },
    Q9: { labels: { en: { value: "The Smiths" } }, descriptions: { en: { value: "band" } }, claims: { P154: claim("The Smiths Logo.PNG") } },
    Q7: {
      labels: { en: { value: "Smiths Group" } },
      descriptions: { en: { value: "British multinational engineering company" } },
      claims: { P154: claim("Smiths Group logo.svg"), P856: claim("https://smiths-group.com") },
    },
    Q8: { labels: { en: { value: "Smithsonian Institution" } }, descriptions: { en: { value: "museum in Washington" } }, claims: {} },
  },
};

describe("name and food scores", () => {
  it("normalises names the way makers get written", () => {
    expect(normName("McVitie's")).toBe("mcvities");
    expect(normName("Mr. Porky")).toBe("mr porky");
    expect(normName("Nerds (candy)")).toBe("nerds");
  });

  it("rates how well a name fits", () => {
    expect(nameScore("smiths", "Smith's")).toBe(3);
    expect(nameScore("kp", "KP Snacks")).toBe(2);
    expect(nameScore("smiths", "The Smiths")).toBe(1);
    expect(nameScore("kettle krinkle", "Kettle Foods")).toBe(0);
    expect(nameScore("kettle krinkle", "Kettle")).toBe(1);
    expect(nameScore("smiths", "Smithsonian Institution")).toBe(0);
  });

  it("prefers food companies and drops bands, places and museums", () => {
    expect(foodScore("British crisp brand")).toBe(3);
    expect(foodScore("British multinational engineering company")).toBe(1);
    expect(foodScore("English rock band")).toBe(-4);
    expect(foodScore("city in Spain")).toBe(-4);
  });
});

describe("ranking", () => {
  const pages = readWikipedia(WIKI);
  const matches = buildMatches(pages, readEntities(["Q2", "Q5", "Q9", "Q7", "Q8"], ENTITIES));

  it("reads Wikipedia results in search order and joins them to Wikidata", () => {
    expect(pages.map((p) => p.title)).toEqual(["Smith's Snackfood Company", "The Smiths", "Walkers (snack foods)"]);
    expect(matches[0]).toMatchObject({ name: "Smith's Snackfood Company", logoFile: "Smiths logo.svg", website: "https://www.smiths-crisps.co.uk/" });
    expect(matches.map((m) => m.name)).toContain("Smiths Group");
  });

  it("never suggests another food company's logo or the band's", () => {
    const walkers = matches.find((m) => m.name.startsWith("Walkers"))!;
    expect(matchScore("smiths", walkers)).toBe(0);
    const band = matches.find((m) => m.name === "The Smiths")!;
    expect(matchScore("smiths", band)).toBeLessThanOrEqual(0);
  });

  it("puts the crisp maker's logos first, then its website, then the engineering firm", () => {
    const icons = new Map([["https://www.smiths-crisps.co.uk/", ["https://www.smiths-crisps.co.uk/apple-touch-icon.png"]]]);
    const ranked = rankCandidates("Smiths", matches, icons);
    expect(ranked.map((c) => c.source).slice(0, 4)).toEqual(["wikidata", "wikipedia", "website", "website"]);
    expect(ranked[0].url).toBe(commonsUrl("Smiths logo.svg"));
    expect(ranked[1].label).toContain("logo from Wikipedia");
    expect(ranked[2].url).toBe("https://www.smiths-crisps.co.uk/apple-touch-icon.png");
    expect(ranked.findIndex((c) => c.label.startsWith("Smiths Group"))).toBeGreaterThan(3);
    expect(ranked.some((c) => /Walkers|Smiths_Logo\.PNG|Smithsonian/i.test(c.url + c.label))).toBe(false);
  });

  it("shows the same logo file once when Wikidata and Wikipedia both have it", () => {
    const m = buildMatches(
      [{ index: 1, title: "Tayto", description: "crisp brand", pageimage: "Tayto.svg", thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Tayto.svg/250px-Tayto.svg.png" }, pageprops: { wikibase_item: "Q1" } }],
      readEntities(["Q1"], { entities: { Q1: { labels: { en: { value: "Tayto" } }, claims: { P154: claim("Tayto.svg") } } } }),
    );
    expect(rankCandidates("tayto", m).filter((c) => c.source !== "website")).toHaveLength(1);
  });
});

describe("websites", () => {
  it("finds home-screen and large icons in a page, best first", () => {
    const html = `<head>
      <link rel="icon" href="/favicon.ico">
      <link rel="icon" type="image/png" sizes="32x32" href="/fav-32.png">
      <link rel="icon" type="image/png" sizes="192x192" href="/fav-192.png">
      <link href="https://cdn.example.com/touch.png" rel="apple-touch-icon" sizes="180x180">
    </head>`;
    expect(readSiteIcons(html, "https://www.walkers.co.uk/home")).toEqual([
      "https://cdn.example.com/touch.png",
      "https://www.walkers.co.uk/fav-192.png",
    ]);
  });

  it("guesses a few websites for unknown makers", () => {
    expect(guessSites("Seabrook", "crisps")).toEqual([
      "https://seabrook.co.uk/",
      "https://seabrook.com/",
      "https://seabrookcrisps.co.uk/",
      "https://seabrookcrisps.com/",
      "https://seabrooksnacks.co.uk/",
      "https://seabrooksnacks.com/",
    ]);
    expect(guessSites("KP", "crisps")).toEqual([]);
  });

  it("matches related makers already in the app", () => {
    expect(relatedBrands("kp", "kp snacks")).toBe(true);
    expect(relatedBrands("kettle krinkle", "kettle")).toBe(true);
    expect(relatedBrands("smiths", "smith's")).toBe(true);
    expect(relatedBrands("mars", "marshmallows")).toBe(false);
    expect(relatedBrands("kp", "walkers")).toBe(false);
  });
});

describe("findLogoCandidates", () => {
  it("searches Wikipedia with what the maker makes, Wikidata by name, then reads them", async () => {
    const calls: string[] = [];
    const fake = (async (input: string) => {
      calls.push(input);
      const url = new URL(input);
      const action = url.searchParams.get("action");
      if (url.hostname === "en.wikipedia.org") return new Response(JSON.stringify(WIKI));
      if (action === "wbsearchentities") return new Response(JSON.stringify({ search: [{ id: "Q7" }, { id: "Q8" }, { id: "Q2" }] }));
      if (action === "wbgetentities") return new Response(JSON.stringify(ENTITIES));
      if (url.hostname === "www.smiths-crisps.co.uk")
        return new Response('<link rel="apple-touch-icon" href="/touch.png">', { headers: { "Content-Type": "text/html" } });
      return new Response("nope", { status: 404 });
    }) as unknown as typeof fetch;
    const found = await findLogoCandidates("Smiths", "crisps", fake);
    const wiki = new URL(calls.find((c) => c.includes("wikipedia"))!);
    expect(wiki.searchParams.get("gsrsearch")).toBe("Smiths crisps");
    expect(wiki.searchParams.get("pilicense")).toBe("any");
    const ids = new URL(calls.find((c) => c.includes("wbgetentities"))!).searchParams.get("ids");
    expect(ids).toBe("Q2|Q9|Q5|Q7|Q8");
    expect(found[0].url).toBe(commonsUrl("Smiths logo.svg"));
    expect(found.map((c) => c.url)).toContain("https://www.smiths-crisps.co.uk/touch.png");
    expect(found.at(-1)?.source).toBe("guess");
  });

  it("still works when Wikipedia is down", async () => {
    const fake = (async (input: string) => {
      const url = new URL(input);
      if (url.hostname === "en.wikipedia.org") return new Response("", { status: 503 });
      const action = url.searchParams.get("action");
      if (action === "wbsearchentities") return new Response(JSON.stringify({ search: [{ id: "Q2" }] }));
      return new Response(JSON.stringify(ENTITIES));
    }) as unknown as typeof fetch;
    const found = await findLogoCandidates("Smiths", "crisps", fake);
    expect(found[0].url).toBe(commonsUrl("Smiths logo.svg"));
  });

  it("offers only guesses for a maker nobody knows", async () => {
    const fake = (async (input: string) =>
      new URL(input).hostname === "en.wikipedia.org" ? new Response(JSON.stringify({})) : new Response(JSON.stringify({ search: [] }))) as unknown as typeof fetch;
    const found = await findLogoCandidates("Zzxq", null, fake);
    expect(found.every((c) => c.source === "guess")).toBe(true);
  });
});

describe("fetchLogo", () => {
  // A PNG header saying 250×120.
  const png = (w = 250, h = 120) => {
    const b = new Uint8Array(33);
    b.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    new DataView(b.buffer).setUint32(16, w);
    new DataView(b.buffer).setUint32(20, h);
    return b;
  };
  const reply = (status: number, type: string, body: BodyInit | null = png(), url = "https://upload.wikimedia.org/x.png") => {
    const res = new Response(body, { status, headers: { "Content-Type": type } });
    Object.defineProperty(res, "url", { value: url });
    return async () => res;
  };
  const commons = "https://commons.wikimedia.org/wiki/Special:FilePath/X.svg?width=250";

  it("accepts a decent-sized PNG", async () => {
    expect(await fetchLogo(commons, reply(200, "image/png") as typeof fetch)).toMatchObject({ ok: true, type: "image/png" });
  });

  it("skips Google's 404 globe, tiny favicons, wrong types, empty and huge files", async () => {
    const icon = "https://www.google.com/s2/favicons?domain=x.com&sz=256";
    expect(await fetchLogo(icon, reply(404, "image/png") as typeof fetch)).toEqual({ ok: false, reason: "status 404" });
    expect(await fetchLogo(icon, reply(200, "image/png", png(16, 16)) as typeof fetch)).toEqual({ ok: false, reason: "too small (16×16)" });
    expect(await fetchLogo(commons, reply(200, "image/svg+xml") as typeof fetch)).toMatchObject({ ok: false });
    expect(await fetchLogo(commons, reply(200, "image/png", new Uint8Array(0)) as typeof fetch)).toEqual({ ok: false, reason: "empty" });
    expect(await fetchLogo(commons, reply(200, "image/png", new Uint8Array(600 * 1024)) as typeof fetch)).toEqual({ ok: false, reason: "too big" });
  });

  it("won't fetch from, or follow a redirect to, odd addresses", async () => {
    expect(isSafeLogoUrl("https://www.walkers.co.uk/touch.png")).toBe(true);
    for (const bad of ["http://commons.wikimedia.org/x", "https://127.0.0.1/x.png", "https://localhost/x", "https://a.b:8080/x", "not a url"]) {
      expect(isSafeLogoUrl(bad)).toBe(false);
    }
    expect(await fetchLogo(commons, reply(200, "image/png", png(), "http://evil.example/x.png") as typeof fetch)).toEqual({
      ok: false,
      reason: "redirected elsewhere",
    });
  });

  it("reads sizes from PNG, JPEG and WebP headers", () => {
    expect(imageSize(png(180, 180))).toEqual({ width: 180, height: 180 });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0, 60, 0, 200, 3]);
    expect(imageSize(jpeg)).toEqual({ width: 200, height: 60 });
    const webp = new Uint8Array(30);
    webp.set([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBPVP8X")]);
    webp.set([127, 0, 0, 63, 0, 0], 24); // 128 × 64
    expect(imageSize(webp)).toEqual({ width: 128, height: 64 });
    expect(imageSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("asks Commons for a standard thumbnail width", () => {
    expect(commonsUrl("A b.svg")).toContain("width=250");
  });
});
