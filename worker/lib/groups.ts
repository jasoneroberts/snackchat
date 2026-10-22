import { getCategory } from "../../shared/catalogue";
import type { ResetPeriod, ScoringMode } from "../../shared/types";

export const SCORING_MODES: ScoringMode[] = ["points", "unique", "checkins"];
export const RESET_PERIODS: ResetPeriod[] = ["weekly", "monthly", "never"];
export const MAX_MEMBERS = 50;
export const MAX_OWNED_GROUPS = 10;

export interface GroupInput {
  name: string;
  scoringMode: ScoringMode;
  resetPeriod: ResetPeriod;
  categories: string[] | null; // null = every snack type counts
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateGroup(raw: unknown): Result<GroupInput> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Missing group." };
  const body = raw as Record<string, unknown>;

  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 40) return { ok: false, error: "Group names are 2 to 40 characters." };

  const scoringMode = body.scoringMode ?? "points";
  if (!SCORING_MODES.includes(scoringMode as ScoringMode)) return { ok: false, error: "Pick how to rank people." };

  const resetPeriod = body.resetPeriod ?? "weekly";
  if (!RESET_PERIODS.includes(resetPeriod as ResetPeriod)) return { ok: false, error: "Pick when the board resets." };

  let categories: string[] | null = null;
  if (Array.isArray(body.categories) && body.categories.length > 0) {
    if (!body.categories.every((c) => typeof c === "string" && getCategory(c))) {
      return { ok: false, error: "Unknown snack type." };
    }
    categories = [...new Set(body.categories as string[])];
  }

  return {
    ok: true,
    value: { name, scoringMode: scoringMode as ScoringMode, resetPeriod: resetPeriod as ResetPeriod, categories },
  };
}

// Invite codes avoid look-alike characters (0/O, 1/I/L) so they can be read out loud.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newInviteCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** Codes are typed by hand, so ignore case, spaces and dashes. */
export function normaliseCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * When the current leaderboard period started (Unix seconds, UTC):
 * weekly boards start on Monday, monthly ones on the 1st.
 */
export function periodStart(period: ResetPeriod, nowSeconds: number): number {
  if (period === "never") return 0;
  const d = new Date(nowSeconds * 1000);
  if (period === "monthly") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday) / 1000;
}

/** When the current period ends, or null for boards that never reset. */
export function periodEnd(period: ResetPeriod, nowSeconds: number): number | null {
  if (period === "never") return null;
  const start = new Date(periodStart(period, nowSeconds) * 1000);
  if (period === "monthly") return Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1) / 1000;
  return start.getTime() / 1000 + 7 * 86400;
}

/** Sort by value, highest first; equal values share a rank (1, 2, 2, 4). */
export function rank<T extends { value: number; username: string }>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value || a.username.localeCompare(b.username));
  let current = 0;
  return sorted.map((row, i) => {
    if (i === 0 || sorted[i - 1].value !== row.value) current = i + 1;
    return { ...row, rank: current };
  });
}
