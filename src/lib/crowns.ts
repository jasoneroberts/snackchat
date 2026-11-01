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

const DAY = 86400 * 1000;
const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * What one snack award is called: "Snack of the week (19 to 25 Oct)" or
 * "Snack of the month (October)". Weeks run Monday to Sunday, UTC, like the Table.
 */
export function snackAwardLabel(kind: "week" | "month", now = Date.now()): string {
  const d = new Date(now);
  if (kind === "month") {
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
    return `Snack of the month (${last.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })})`;
  }
  const thisMonday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return `Snack of the week (${shortDate(thisMonday - 7 * DAY)} to ${shortDate(thisMonday - DAY)})`;
}
