import { badWordError } from "../../shared/badWords";
import { POINTS, REVIEW_BONUS_CHARS, attributesFor, getCategory } from "../../shared/catalogue";

export interface CheckinInput {
  snackId: string;
  overall: number;
  attributes: Record<string, number>;
  review: string | null;
  venue: string | null;
  pairedWith: string | null;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const optionalText = (value: unknown, max: number): string | null | false => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length > max) return false;
  return trimmed || null;
};

/**
 * Check a check-in sent by the browser. `categoryId` is the snack's category,
 * looked up from the database, so only that category's sliders are accepted.
 */
export function validateCheckin(raw: unknown, categoryId: string): Result<CheckinInput> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Missing check-in." };
  const body = raw as Record<string, unknown>;

  if (typeof body.snackId !== "string" || !body.snackId) return { ok: false, error: "Pick a snack." };

  // Overall rating: 0.25 to 5 in quarter steps.
  const overall = Number(body.overall);
  if (!Number.isFinite(overall) || overall < 0.25 || overall > 5 || !Number.isInteger(overall * 4)) {
    return { ok: false, error: "Give it a star rating." };
  }

  // Sliders are optional; any that are sent must be 1 to 5 and belong to the category.
  if (!getCategory(categoryId)) return { ok: false, error: "That snack has an unknown category." };
  const allowed = new Set(attributesFor(categoryId).map((a) => a.key));
  const attributes: Record<string, number> = {};
  const rawAttrs = body.attributes ?? {};
  if (typeof rawAttrs !== "object" || Array.isArray(rawAttrs)) return { ok: false, error: "Sliders are malformed." };
  for (const [key, value] of Object.entries(rawAttrs as Record<string, unknown>)) {
    if (!allowed.has(key)) return { ok: false, error: `"${key}" isn't a slider for this snack.` };
    if (value === null || value === 0) continue; // left on "skip"
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
      return { ok: false, error: "Sliders go from 1 to 5." };
    }
    attributes[key] = value;
  }

  const review = optionalText(body.review, 1000);
  if (review === false) return { ok: false, error: "Keep the review under 1,000 characters." };
  const venue = optionalText(body.venue, 80);
  if (venue === false) return { ok: false, error: "Keep \"Where?\" under 80 characters." };
  const pairedWith = optionalText(body.pairedWith, 80);
  if (pairedWith === false) return { ok: false, error: "Keep \"With?\" under 80 characters." };
  const rude = badWordError({ review, '"Where?"': venue, '"With?"': pairedWith });
  if (rude) return { ok: false, error: rude };

  return { ok: true, value: { snackId: body.snackId, overall, attributes, review, venue, pairedWith } };
}

export interface PointsLine {
  reason: "new_snack" | "repeat" | "photo" | "review";
  points: number;
}

/**
 * Work out the points for one check-in. `earnedToday` is what the person has
 * already earned since midnight UTC; the total for the day never passes the cap,
 * so lines are trimmed (and dropped once they reach zero).
 */
export function pointsFor(opts: {
  firstTime: boolean;
  hasPhoto: boolean;
  review: string | null;
  earnedToday: number;
}): PointsLine[] {
  const lines: PointsLine[] = [
    opts.firstTime ? { reason: "new_snack", points: POINTS.newSnack } : { reason: "repeat", points: POINTS.repeat },
  ];
  if (opts.hasPhoto) lines.push({ reason: "photo", points: POINTS.photo });
  if (opts.review && opts.review.length >= REVIEW_BONUS_CHARS) lines.push({ reason: "review", points: POINTS.review });

  let left = Math.max(0, POINTS.dailyCap - opts.earnedToday);
  const capped: PointsLine[] = [];
  for (const line of lines) {
    const points = Math.min(line.points, left);
    if (points > 0) capped.push({ ...line, points });
    left -= points;
  }
  return capped;
}

export function startOfUtcDay(nowSeconds: number): number {
  return nowSeconds - (nowSeconds % 86400);
}
