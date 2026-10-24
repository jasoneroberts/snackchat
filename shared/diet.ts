// Diet filters: vegan, and labelled gluten-free. An admin confirms each
// snack (Settings > Diet check); unchecked snacks never pass a filter.

export type Diet = "vegan" | "gf";

export const DIETS: { id: Diet; label: string }[] = [
  { id: "vegan", label: "Vegan" },
  { id: "gf", label: "Labelled gluten-free" },
];

// Recipes change and labels are the maker's claim, so we always say this.
export const DIET_NOTE = "From the pack label when we checked. Recipes change, so always check the pack.";

/** "vegan,gf" from a query string, keeping only known diets. */
export function readDiets(value: string | undefined | null): Diet[] {
  return (value ?? "").split(",").filter((d): d is Diet => DIETS.some((x) => x.id === d));
}

/** SQL conditions for the chosen diets, on a snacks table aliased `s`. Safe to splice: fixed strings only. */
export function dietSql(diets: Diet[]): string {
  return diets.map((d) => (d === "vegan" ? " AND s.vegan = 1" : " AND s.gluten_free = 1")).join("");
}
