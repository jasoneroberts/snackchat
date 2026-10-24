import type { Preferences } from "../../shared/types";

// A snack needs at least this many of your set preferences to compare against,
// otherwise one lucky slider could make it a "100% match".
export const MIN_OVERLAP = 2;

/**
 * Checks a taste body from the client for one snack type. `keys` are the
 * sliders that type is rated on; each is 1-5, or null for "don't mind".
 * Other keys are ignored. Returns null if anything is invalid.
 */
export function readPreferences(body: unknown, keys: string[]): Preferences | null {
  if (!body || typeof body !== "object") return null;
  const prefs: Preferences = {};
  for (const key of keys) {
    const v = (body as Record<string, unknown>)[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) return null;
    prefs[key] = v;
  }
  return prefs;
}

/**
 * How close a snack's average sliders are to your taste for its type, from 0 to 1.
 *
 * For each slider you've set and the snack has ratings for, the gap is
 * |yours - average|, which can be 0 to 4 on a 1-5 scale. The score is
 * 1 - (mean gap / 4): identical bars give 1, opposite ends give 0. Returns
 * null when there aren't enough sliders in common to say.
 */
export function matchScore(prefs: Preferences, averages: Record<string, number>): number | null {
  const set = Object.keys(prefs).filter((k) => prefs[k] != null);
  const shared = set.filter((k) => averages[k] != null);
  if (shared.length === 0 || shared.length < Math.min(MIN_OVERLAP, set.length)) return null;
  const gap = shared.reduce((sum, k) => sum + Math.abs(prefs[k]! - averages[k]), 0) / shared.length;
  return 1 - gap / 4;
}

export interface Candidate {
  id: string;
  prefs: Preferences; // your taste for this snack's type
  averages: Record<string, number>;
  rating: number; // weighted overall rating, used to break ties
}

/** Candidates that can be scored, best match first; equal matches go to the better-rated snack. */
export function rankMatches<T extends Candidate>(candidates: T[]): (T & { match: number })[] {
  return candidates
    .flatMap((c) => {
      const match = matchScore(c.prefs, c.averages);
      return match === null ? [] : [{ ...c, match }];
    })
    .sort((a, b) => b.match - a.match || b.rating - a.rating || a.id.localeCompare(b.id));
}
