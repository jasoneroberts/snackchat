// Snack categories and rating sliders, shared by the Worker (to validate
// check-ins) and the front end (to draw the sliders).
//
// The ids here must match the rows in the `categories` table
// (migrations/0002_catalogue.sql). The table is what snacks point at; this
// file is where the labels live.

export interface Attribute {
  key: string;
  label: string;
  low: string; // what 1 means
  high: string; // what 5 means
}

export interface Category {
  id: string;
  name: string;
  short: string; // for "#2 in crisps"
  tint: string; // placeholder colour where a photo would go
  extra: Attribute[]; // sliders for this category, after the universal ones
}

export const crunch: Attribute = { key: "crunch", label: "Crunch", low: "Soft", high: "Shatters" };
export const spice: Attribute = { key: "spice", label: "Spice", low: "Mild", high: "Blazing" };

// Every snack gets these.
export const UNIVERSAL: Attribute[] = [
  { key: "flavour", label: "Flavour", low: "Subtle", high: "Huge" },
  { key: "salt", label: "Saltiness", low: "None", high: "Very" },
  { key: "sweet", label: "Sweetness", low: "None", high: "Very" },
  { key: "value", label: "Value for money", low: "Poor", high: "Great" },
  { key: "more", label: "Moreishness", low: "One is plenty", high: "Gone in seconds" },
];

export const CATEGORIES: Category[] = [
  {
    id: "crisps",
    name: "Crisps and chips",
    short: "crisps",
    tint: "#FBD7A8",
    extra: [crunch, spice, { key: "grease", label: "Greasiness", low: "Dry", high: "Greasy" }],
  },
  {
    id: "popcorn",
    name: "Popcorn",
    short: "popcorn",
    tint: "#FFF0B3",
    extra: [
      crunch,
      { key: "coating", label: "Coating", low: "Light dusting", high: "Smothered" },
      { key: "husks", label: "Bits in your teeth", low: "None", high: "Everywhere" },
    ],
  },
  { id: "nuts", name: "Nuts and seeds", short: "nuts", tint: "#D9E6B8", extra: [crunch, spice] },
  {
    id: "chocolate",
    name: "Chocolate",
    short: "chocolate",
    tint: "#D9B8A5",
    extra: [
      { key: "rich", label: "Richness", low: "Light", high: "Decadent" },
      { key: "melt", label: "Melt", low: "Firm", high: "Melts instantly" },
    ],
  },
  {
    id: "chews",
    name: "Sweets and chews",
    short: "sweets",
    tint: "#F7C9DD",
    extra: [
      { key: "chew", label: "Chewiness", low: "Snap", high: "Chewy" },
      { key: "sour", label: "Sourness", low: "Sweet", high: "Face-melting" },
    ],
  },
  {
    id: "biscuits",
    name: "Biscuits",
    short: "biscuits",
    tint: "#EAD3B5",
    extra: [crunch, { key: "dunk", label: "Dunkability", low: "Collapses", high: "Survives" }],
  },
  {
    id: "kids",
    name: "Kids snacks",
    short: "kids snacks",
    tint: "#CFE4F7",
    extra: [
      { key: "kid", label: "Kid approval", low: "Refused", high: "Loved it" },
      { key: "mess", label: "Mess factor", low: "Tidy", high: "Carnage" },
    ],
  },
  {
    id: "world",
    name: "World snacks",
    short: "world snacks",
    tint: "#F6B8A8",
    extra: [spice, { key: "novelty", label: "Novelty", low: "Familiar", high: "Wild" }],
  },
  {
    id: "healthy",
    name: "Healthy snacks",
    short: "healthy snacks",
    tint: "#CDEBD3",
    extra: [
      { key: "fill", label: "Fills you up", low: "Not at all", high: "Proper meal" },
      { key: "healthy", label: "Healthiness", low: "A treat", high: "Virtuous" },
    ],
  },
];

const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): Category | undefined {
  return byId.get(id);
}

/** All the sliders a snack in this category can be rated on. */
export function attributesFor(categoryId: string): Attribute[] {
  return [...UNIVERSAL, ...(byId.get(categoryId)?.extra ?? [])];
}

const labels = new Map([...UNIVERSAL, ...CATEGORIES.flatMap((c) => c.extra)].map((a) => [a.key, a.label]));

export function attributeLabel(key: string): string {
  return labels.get(key) ?? key;
}

// Points for a check-in (see the definition doc's scoring section).
export const POINTS = {
  newSnack: 10, // first time this person checks in this snack
  repeat: 2,
  photo: 3,
  review: 2, // review of at least REVIEW_BONUS_CHARS characters
  dailyCap: 100,
} as const;
export const REVIEW_BONUS_CHARS = 50;
