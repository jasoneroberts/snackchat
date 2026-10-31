// Demo data so the live app has something to look at before friends join.
// Every row it makes has an id starting "demo-", and every photo lives in R2
// under "demo/", so it can all be removed again in one go (routes/admin.ts).
//
// Since the public launch (2026-10-30) the app only removes demo data; nothing
// calls the builders below any more. They're kept, with their tests, for a
// local or staging copy of the app.

import { POINTS, REVIEW_BONUS_CHARS } from "../../shared/catalogue";

export const DEMO_PREFIX = "demo-";
export const DEMO_PHOTO_PREFIX = "demo/";

interface DemoPerson {
  username: string;
  favourites: string[]; // snack ids (seed-*) they check in most
  generous: number; // added to every rating they give, -0.5 to +0.5
}

const PEOPLE: DemoPerson[] = [
  { username: "crisp_queen", generous: 0.25, favourites: ["seed-walkers-cheese-onion", "seed-mccoys-flame-grilled-steak", "seed-kettle-sea-salt-balsamic", "seed-tyrrells-sea-salted", "seed-pipers-anglesey-sea-salt", "seed-seabrook-original"] },
  { username: "pub_grub_pete", generous: 0, favourites: ["seed-scampi-fries", "seed-bacon-fries", "seed-pork-scratchings", "seed-dry-roasted-peanuts", "seed-mccoys-salt-malt-vinegar"] },
  { username: "choc_o_clock", generous: 0.5, favourites: ["seed-dairy-milk", "seed-maltesers", "seed-twix", "seed-chocolate-hobnobs", "seed-jaffa-cakes"] },
  { username: "chilli_charlie", generous: -0.25, favourites: ["seed-takis-fuego", "seed-doritos-chilli-heatwave", "seed-monster-munch-flamin-hot", "seed-nik-naks-nice-spicy", "seed-wasabi-peas"] },
  { username: "nana_biscuit", generous: 0.25, favourites: ["seed-jaffa-cakes", "seed-chocolate-hobnobs", "seed-dairy-milk", "seed-walkers-ready-salted"] },
  { username: "vinegar_vic", generous: -0.5, favourites: ["seed-walkers-salt-vinegar", "seed-mccoys-salt-malt-vinegar", "seed-chipsticks-salt-vinegar", "seed-discos-salt-vinegar", "seed-pringles-salt-vinegar"] },
  { username: "sweet_tooth_sal", generous: 0.25, favourites: ["seed-starmix", "seed-tangfastics", "seed-fruit-pastilles", "seed-maltesers"] },
  { username: "gym_snacker", generous: -0.25, favourites: ["seed-nakd-cocoa-orange", "seed-graze-protein-oat-bites", "seed-salted-pistachios", "seed-popchips-sea-salt"] },
];

// How good each snack "really" is, before each person's own taste.
const QUALITY: Record<string, number> = {
  "seed-walkers-cheese-onion": 4, "seed-mccoys-flame-grilled-steak": 4.25, "seed-kettle-sea-salt-balsamic": 4,
  "seed-tyrrells-sea-salted": 3.75, "seed-pipers-anglesey-sea-salt": 4.25, "seed-seabrook-original": 3.5,
  "seed-scampi-fries": 4, "seed-bacon-fries": 3.75, "seed-pork-scratchings": 3.5, "seed-dry-roasted-peanuts": 3.75,
  "seed-mccoys-salt-malt-vinegar": 4.25, "seed-dairy-milk": 4, "seed-maltesers": 4.25, "seed-twix": 3.75,
  "seed-chocolate-hobnobs": 4.5, "seed-jaffa-cakes": 4.25, "seed-takis-fuego": 3.75, "seed-doritos-chilli-heatwave": 3.5,
  "seed-monster-munch-flamin-hot": 3.75, "seed-nik-naks-nice-spicy": 4, "seed-wasabi-peas": 3.25,
  "seed-walkers-ready-salted": 3.5, "seed-walkers-salt-vinegar": 3.75, "seed-chipsticks-salt-vinegar": 3.5,
  "seed-discos-salt-vinegar": 3.75, "seed-pringles-salt-vinegar": 3.25, "seed-starmix": 3.75, "seed-tangfastics": 4,
  "seed-fruit-pastilles": 3.75, "seed-nakd-cocoa-orange": 3.25, "seed-graze-protein-oat-bites": 3,
  "seed-salted-pistachios": 4, "seed-popchips-sea-salt": 3.25,
};

// Each snack's character as [flavour, saltiness, sweetness], 1-5. Demo
// check-ins land within a point of these, so Explore has sensible averages.
const TASTE: Record<string, [number, number, number]> = {
  "seed-walkers-cheese-onion": [4, 4, 1], "seed-mccoys-flame-grilled-steak": [5, 4, 1], "seed-kettle-sea-salt-balsamic": [4, 4, 2],
  "seed-tyrrells-sea-salted": [2, 4, 1], "seed-pipers-anglesey-sea-salt": [2, 4, 1], "seed-seabrook-original": [2, 3, 1],
  "seed-scampi-fries": [5, 5, 1], "seed-bacon-fries": [4, 4, 2], "seed-pork-scratchings": [4, 5, 1], "seed-dry-roasted-peanuts": [3, 4, 1],
  "seed-mccoys-salt-malt-vinegar": [5, 5, 1], "seed-dairy-milk": [3, 1, 5], "seed-maltesers": [3, 1, 4], "seed-twix": [3, 2, 5],
  "seed-chocolate-hobnobs": [4, 2, 4], "seed-jaffa-cakes": [3, 1, 4], "seed-takis-fuego": [5, 4, 1], "seed-doritos-chilli-heatwave": [4, 3, 2],
  "seed-monster-munch-flamin-hot": [5, 3, 1], "seed-nik-naks-nice-spicy": [5, 3, 2], "seed-wasabi-peas": [4, 3, 1],
  "seed-walkers-ready-salted": [2, 3, 1], "seed-walkers-salt-vinegar": [4, 4, 1], "seed-chipsticks-salt-vinegar": [4, 4, 1],
  "seed-discos-salt-vinegar": [4, 4, 1], "seed-pringles-salt-vinegar": [3, 4, 1], "seed-starmix": [3, 1, 5], "seed-tangfastics": [5, 1, 4],
  "seed-fruit-pastilles": [3, 1, 4], "seed-nakd-cocoa-orange": [3, 1, 3], "seed-graze-protein-oat-bites": [2, 2, 3],
  "seed-salted-pistachios": [3, 4, 1], "seed-popchips-sea-salt": [2, 3, 1],
};

// How hot the snacks whose type has a Spice slider are (crisps, nuts and
// world snacks), so Explore can match chilli fans.
const SPICE: Record<string, number> = {
  "seed-walkers-cheese-onion": 1, "seed-mccoys-flame-grilled-steak": 2, "seed-kettle-sea-salt-balsamic": 1,
  "seed-tyrrells-sea-salted": 1, "seed-pipers-anglesey-sea-salt": 1, "seed-seabrook-original": 1,
  "seed-scampi-fries": 1, "seed-bacon-fries": 1, "seed-pork-scratchings": 1, "seed-dry-roasted-peanuts": 2,
  "seed-mccoys-salt-malt-vinegar": 1, "seed-takis-fuego": 5, "seed-doritos-chilli-heatwave": 4,
  "seed-monster-munch-flamin-hot": 4, "seed-nik-naks-nice-spicy": 4, "seed-wasabi-peas": 5,
  "seed-walkers-ready-salted": 1, "seed-walkers-salt-vinegar": 1, "seed-chipsticks-salt-vinegar": 1,
  "seed-discos-salt-vinegar": 1, "seed-pringles-salt-vinegar": 1, "seed-salted-pistachios": 1, "seed-popchips-sea-salt": 1,
};

// How crunchy the snacks whose type has a Crunch slider are (crisps, nuts
// and biscuits).
const CRUNCH: Record<string, number> = {
  "seed-walkers-cheese-onion": 3, "seed-mccoys-flame-grilled-steak": 5, "seed-kettle-sea-salt-balsamic": 5,
  "seed-tyrrells-sea-salted": 5, "seed-pipers-anglesey-sea-salt": 5, "seed-seabrook-original": 4,
  "seed-scampi-fries": 4, "seed-bacon-fries": 3, "seed-pork-scratchings": 5, "seed-dry-roasted-peanuts": 4,
  "seed-mccoys-salt-malt-vinegar": 5, "seed-doritos-chilli-heatwave": 4, "seed-monster-munch-flamin-hot": 3,
  "seed-nik-naks-nice-spicy": 4, "seed-wasabi-peas": 5, "seed-walkers-ready-salted": 3, "seed-walkers-salt-vinegar": 3,
  "seed-chipsticks-salt-vinegar": 3, "seed-discos-salt-vinegar": 3, "seed-pringles-salt-vinegar": 3,
  "seed-salted-pistachios": 3, "seed-popchips-sea-salt": 2, "seed-chocolate-hobnobs": 4, "seed-jaffa-cakes": 1,
};


const REVIEWS = [
  "Proper crunch, would buy again.",
  "Bit too salty for me but I still finished the bag.",
  "Absolute classic. Can't go wrong with these.",
  "Shared these at the pub and they were gone in about four minutes.",
  "Flavour hits hard then fades. Decent value for the price.",
  "Not my favourite, a bit bland compared to the others.",
  "Perfect with a cold drink on a Friday.",
  "Too moreish. Dangerous to have in the house.",
  "Kids loved them, I thought they were alright.",
  "Better than I remembered from school.",
  null,
  null,
  null,
];

const VENUES = ["The Red Lion", "Desk", "Train home", "Sofa", "Five-a-side", "Mum's", null, null, null];

/** A small seeded random number generator, so the demo data is the same every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const quarter = (n: number) => Math.min(5, Math.max(0.25, Math.round(n * 4) / 4));

export interface DemoCheckin {
  id: string;
  userId: string;
  snackId: string;
  overall: number;
  review: string | null;
  venue: string | null;
  attributes: Record<string, number>;
  createdAt: number;
  points: { reason: string; points: number }[];
}

export interface DemoData {
  users: { id: string; username: string }[];
  checkins: DemoCheckin[];
}

export const demoUserId = (username: string) => `${DEMO_PREFIX}${username}`;

/** One made-up check-in by `person` of `snackId`, using the snack's "real" quality and taste. */
function makeCheckin(
  random: () => number,
  person: DemoPerson,
  snackId: string,
  id: string,
  createdAt: number,
  repeat: boolean,
): DemoCheckin {
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
  // A slider score: the snack's real value give or take one, kept on the 1-5 scale.
  const nudge = (n: number) => Math.min(5, Math.max(1, n + Math.floor(random() * 3) - 1));
  const overall = quarter(QUALITY[snackId] + person.generous + (random() - 0.5));
  const review = pick(REVIEWS);
  const points = [repeat ? { reason: "repeat", points: POINTS.repeat } : { reason: "new_snack", points: POINTS.newSnack }];
  if (review && review.length >= REVIEW_BONUS_CHARS) points.push({ reason: "review", points: POINTS.review });
  return {
    id,
    userId: demoUserId(person.username),
    snackId,
    overall,
    review,
    venue: pick(VENUES),
    attributes: {
      flavour: nudge(TASTE[snackId][0]),
      salt: nudge(TASTE[snackId][1]),
      sweet: nudge(TASTE[snackId][2]),
      ...(SPICE[snackId] ? { spice: nudge(SPICE[snackId]) } : {}),
      ...(CRUNCH[snackId] ? { crunch: nudge(CRUNCH[snackId]) } : {}),
      value: 1 + Math.floor(random() * 5),
      more: 2 + Math.floor(random() * 4),
    },
    createdAt,
    points,
  };
}

/** Build the demo people and three weeks of their check-ins, ending at `now`. */
export function buildDemoData(now: number, seed = 7): DemoData {
  const random = rng(seed);
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
  const allSnacks = Object.keys(QUALITY);
  const checkins: DemoCheckin[] = [];

  PEOPLE.forEach((person, p) => {
    const seen = new Set<string>();
    const count = 5 + Math.floor(random() * 6); // 5 to 10 check-ins each
    for (let i = 0; i < count; i++) {
      // Mostly their favourites, sometimes something else.
      const snackId = random() < 0.75 ? pick(person.favourites) : pick(allSnacks);
      // Squaring bunches check-ins towards the last few days, so the feed looks lively.
      const createdAt = now - Math.floor(random() ** 2 * 21 * 24 * 3600) - 600;
      checkins.push(makeCheckin(random, person, snackId, `${DEMO_PREFIX}c${p}-${i}`, createdAt, seen.has(snackId)));
      seen.add(snackId);
    }
  });

  return {
    users: PEOPLE.map((p) => ({ id: demoUserId(p.username), username: p.username })),
    checkins,
  };
}

/**
 * A few fresh check-ins from random demo people, spread over the last few
 * hours, for the admin's "Add more check-ins" button. `had` holds
 * "userId|snackId" pairs already checked in, so points come out right.
 * Ids start "demo-m<now>-", so they never clash and go with the rest.
 */
export function buildMoreCheckins(now: number, count: number, had: Set<string>, seed = now): DemoCheckin[] {
  const random = rng(seed);
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
  const allSnacks = Object.keys(QUALITY);
  const out: DemoCheckin[] = [];
  for (let i = 0; i < count; i++) {
    const person = pick(PEOPLE);
    const snackId = random() < 0.6 ? pick(person.favourites) : pick(allSnacks);
    const createdAt = now - Math.floor(random() * 4 * 3600) - 60;
    const pair = `${demoUserId(person.username)}|${snackId}`;
    out.push(makeCheckin(random, person, snackId, `${DEMO_PREFIX}m${now}-${i}`, createdAt, had.has(pair)));
    had.add(pair);
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

export const DEMO_GROUPS = [
  { id: `${DEMO_PREFIX}g-crisp-club`, name: "Office Crisp Club", scoring: "points", reset: "weekly", owner: "crisp_queen",
    members: ["pub_grub_pete", "vinegar_vic", "chilli_charlie", "gym_snacker"] },
  { id: `${DEMO_PREFIX}g-pub-quiz`, name: "Pub Quiz Lot", scoring: "unique", reset: "monthly", owner: "pub_grub_pete",
    members: ["choc_o_clock", "nana_biscuit", "sweet_tooth_sal", "crisp_queen"] },
] as const;

/** About three in four demo check-ins get a photo, like a keen real crowd. */
export function wantsPhoto(checkinId: string): boolean {
  let h = 0;
  for (const ch of checkinId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 4 !== 0;
}

/** Up to this many different pack photos per snack, so cards don't all match. */
export const PHOTOS_PER_SNACK = 3;

/** Where the nth photo of a demo snack lives in R2. */
export const demoPhotoKey = (snackId: string, n: number) => `${DEMO_PHOTO_PREFIX}${snackId}${n ? `-${n}` : ""}`;

/** Different image URLs from an Open Food Facts search, best first. */
export function pickImages(products: { image_front_url?: string }[] | undefined, max = PHOTOS_PER_SNACK): string[] {
  const urls = (products ?? []).map((p) => p.image_front_url).filter((u): u is string => !!u);
  return [...new Set(urls)].slice(0, max);
}

/**
 * A face for a demo person. thispersondoesnotexist.com makes a new
 * AI-generated face on every request: nobody real, so no one's photo is used
 * without their say-so. Each person's face is fetched once and kept in R2.
 * If that site turns the Worker away, a random photo from Lorem Picsum
 * (free Unsplash pictures of anything: dogs, hills, coffee) is used instead,
 * so nobody is left with just initials.
 */
export const DEMO_FACE_URL = "https://thispersondoesnotexist.com/";
export const demoPictureUrl = (username: string) => `https://picsum.photos/seed/crunchd-${encodeURIComponent(username)}/256`;
// "f" for a face. Older demo data used drawn avatars ("a"), which the
// "Add photos and profile pictures" button swaps for faces.
export const demoAvatarId = (username: string) => `${DEMO_PREFIX}f-${username}`;
/** Whether a demo person still needs their face (none yet, or an old drawing). */
export const needsFace = (username: string, avatarId: string | null) => avatarId !== demoAvatarId(username);

/**
 * The Open Food Facts search for a snack's pack photo. Their pictures are
 * shared under CC BY-SA, which is fine for demo data we delete later.
 */
export function offSearchUrl(name: string, brand: string | null): string {
  const terms = `${brand ?? ""} ${name}`.trim();
  const params = new URLSearchParams({
    search_terms: terms,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "5",
    fields: "product_name,brands,image_front_url",
    tagtype_0: "countries",
    tag_contains_0: "contains",
    tag_0: "united-kingdom",
  });
  return `https://world.openfoodfacts.org/cgi/search.pl?${params}`;
}
