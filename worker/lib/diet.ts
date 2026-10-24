// Suggesting diet labels from Open Food Facts, for an admin to confirm.

export interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  labels_tags?: string[];
  ingredients_analysis_tags?: string[];
  allergens_tags?: string[];
  traces_tags?: string[];
}

export interface DietSuggestion {
  product: { name: string; brands: string; url: string } | null;
  vegan: boolean | null; // null = Open Food Facts doesn't say
  glutenFree: boolean | null;
  why: string[]; // short reasons, shown to the admin
}

const FIELDS = "code,product_name,brands,labels_tags,ingredients_analysis_tags,allergens_tags,traces_tags";

/** Open Food Facts search for a snack, UK products first. */
export function offDietSearchUrl(name: string, brand: string | null): string {
  const params = new URLSearchParams({
    search_terms: `${brand ?? ""} ${name}`.trim(),
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "10",
    fields: FIELDS,
    tagtype_0: "countries",
    tag_contains_0: "contains",
    tag_0: "united-kingdom",
  });
  return `https://world.openfoodfacts.org/cgi/search.pl?${params}`;
}

/** The search result most likely to be this snack: the first from the same maker, else the first. */
export function pickProduct(products: OffProduct[], brand: string | null): OffProduct | null {
  const named = products.filter((p) => p.product_name);
  if (!named.length) return null;
  const maker = brand?.trim().toLowerCase();
  return (maker && named.find((p) => (p.brands ?? "").toLowerCase().includes(maker))) || named[0];
}

/**
 * What a product's data says about vegan and gluten-free.
 * - Vegan: a "vegan" label, or Open Food Facts' own ingredients check
 *   (vegan / non-vegan). "Maybe vegan" stays unknown.
 * - Gluten-free: only a "gluten-free" / "no gluten" label counts as yes;
 *   gluten in the allergens or traces is a no.
 */
export function suggestDiet(p: OffProduct | null): DietSuggestion {
  if (!p) return { product: null, vegan: null, glutenFree: null, why: ["Not found on Open Food Facts."] };
  const labels = p.labels_tags ?? [];
  const analysis = p.ingredients_analysis_tags ?? [];
  const allergens = [...(p.allergens_tags ?? []), ...(p.traces_tags ?? [])];
  const why: string[] = [];

  let vegan: boolean | null = null;
  if (labels.includes("en:vegan")) {
    vegan = true;
    why.push("Pack is labelled vegan.");
  } else if (analysis.includes("en:non-vegan")) {
    vegan = false;
    why.push("Ingredients include animal products.");
  } else if (analysis.includes("en:vegan")) {
    vegan = true;
    why.push("Ingredients look vegan (no vegan label).");
  } else if (analysis.includes("en:maybe-vegan")) {
    why.push("Ingredients might be vegan; not sure.");
  }

  let glutenFree: boolean | null = null;
  if (labels.includes("en:no-gluten") || labels.includes("en:gluten-free")) {
    glutenFree = true;
    why.push("Pack is labelled gluten-free.");
  } else if (allergens.includes("en:gluten")) {
    glutenFree = false;
    why.push("Contains or may contain gluten.");
  }

  return {
    product: {
      name: p.product_name ?? "",
      brands: p.brands ?? "",
      url: p.code ? `https://world.openfoodfacts.org/product/${encodeURIComponent(p.code)}` : "https://world.openfoodfacts.org",
    },
    vegan,
    glutenFree,
    why,
  };
}
