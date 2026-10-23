import { TASTE } from "../../shared/catalogue";
import type { Preferences } from "../../shared/types";

// The sliders you can set a preference for: the universal ones plus crunch and spice.
export const PREFERENCE_KEYS = TASTE.map((a) => a.key);

// A snack needs at least this many of your set preferences to compare against,
// otherwise one lucky slider could make it a "100% match".
export const MIN_OVERLAP = 2;

/**
 * Checks a preferences body from the client. Each key is 1-5, or null for
 * "don't mind". Unknown keys are ignored. Returns null if anything is invalid.
 */
export function readPreferences(body: unknown): Preferences | null {
  if (!body || typeof body !== "object") return null;
  const prefs: Preferences = {};
  for (const key of PREFERENCE_KEYS) {
    const v = (body as Record<string, unknown>)[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) return null;
    prefs[key] = v;
  }
  return prefs;
}

/**
 * How close a snack's average sliders are to what you like, from 0 to 1.
 *
 * Only sliders that apply to the snack's type count (`keys`, from tasteFor):
 * chocolate isn't marked down for having no spice. For each of those you've
 * set and the snack has ratings for, the gap is |yours - average|, which can
 * be 0 to 4 on a 1-5 scale. The score is 1 - (mean gap / 4): identical bars
 * give 1, opposite ends give 0. Returns null when there aren't enough sliders
 * in common to say.
 */
export function matchScore(prefs: Preferences, averages: Record<string, number>, keys: string[] = PREFERENCE_KEYS): number | null {
  const set = PREFERENCE_KEYS.filter((k) => prefs[k] != null && keys.includes(k));
  const shared = set.filter((k) => averages[k] != null);
  if (shared.length === 0 || shared.length < Math.min(MIN_OVERLAP, set.length)) return null;
  const gap = shared.reduce((sum, k) => sum + Math.abs(prefs[k]! - averages[k]), 0) / shared.length;
  return 1 - gap / 4;
}

export interface Candidate {
  id: string;
  averages: Record<string, number>;
  keys?: string[]; // the sliders that apply to this snack's type; all of them if left out
  rating: number; // weighted overall rating, used to break ties
}

/** Candidates that can be scored, best match first; equal matches go to the better-rated snack. */
export function rankMatches<T extends Candidate>(prefs: Preferences, candidates: T[]): (T & { match: number })[] {
  return candidates
    .flatMap((c) => {
      const match = matchScore(prefs, c.averages, c.keys);
      return match === null ? [] : [{ ...c, match }];
    })
    .sort((a, b) => b.match - a.match || b.rating - a.rating || a.id.localeCompare(b.id));
}
