// Turn search text into LIKE patterns, one per word, so "walkers salt" finds
// Walkers' "Salt and Vinegar" even though the brand and flavour are separate.
// Apostrophes are dropped (here and in the SQL), so "mccoys" finds McCoy's.

const FILLER = new Set(["and", "&", "n", "the"]);

export function searchPatterns(q: string | undefined): string[] {
  if (!q) return [];
  return (
    q
      .toLowerCase()
      .slice(0, 60)
      .replace(/['’]/g, "")
      .split(/\s+/)
      .filter((w) => w && !FILLER.has(w))
      .slice(0, 5)
      // Escape LIKE's wildcards so "100%" searches for a literal percent sign.
      .map((w) => `%${w.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`)
  );
}
