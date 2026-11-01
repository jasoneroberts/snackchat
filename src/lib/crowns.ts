import { useEffect, useState } from "react";
import type { Crowns } from "../../shared/achievements";
import { api } from "../api";

// Who wears a crown this week (worker/lib/champions.ts crowns()). Fetched
// once per app open and shared by every avatar and snack that asks, the
// same way lib/logos.ts shares brand logos.
let pending: Promise<Crowns | null> | null = null;
let loaded: Crowns | null = null;

function load(): Promise<Crowns | null> {
  pending ??= api<Crowns>("/champions/crowns")
    .then((c) => (loaded = c))
    .catch(() => null);
  return pending;
}

export function useCrowns(): Crowns | null {
  const [crowns, setCrowns] = useState<Crowns | null>(loaded);
  useEffect(() => {
    if (!loaded) load().then(setCrowns);
  }, []);
  return crowns;
}

/** What a person's crown means, for its label. */
export function personCrownLabel(kind: "global" | "squad" | undefined): string | null {
  if (kind === "global") return "Top of Crunchd last week";
  if (kind === "squad") return "Squad champion last week";
  return null;
}

/** What a snack's crown means, for its label. */
export function snackCrownLabel(won: ("week" | "month")[] | undefined): string | null {
  if (!won?.length) return null;
  if (won.length === 2) return "Top of the Table last week and last month";
  return won[0] === "week" ? "Top of the Table last week" : "Top of the Table last month";
}
