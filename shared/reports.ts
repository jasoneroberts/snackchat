// What people can report, and why. Admins see reports in Settings > Reports.

export type ReportTarget = "checkin" | "user" | "snack";

export const REPORT_REASONS = [
  { key: "rude", label: "Rude, hateful or bullying" },
  { key: "sexual", label: "Sexual or not safe for work" },
  { key: "spam", label: "Spam or advertising" },
  { key: "wrong", label: "Wrong snack, wrong photo or not a snack" },
  { key: "other", label: "Something else" },
] as const;

// Not complaints: anyone can ask for a snack's details or photo to be put
// right (Settings > All snacks). They land in the same admin list.
export const CHANGE_REASONS = [
  { key: "details", label: "Change name, maker or type" },
  { key: "photo", label: "Change the photo" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["key"] | (typeof CHANGE_REASONS)[number]["key"];

export const isChangeRequest = (reason: string) => CHANGE_REASONS.some((r) => r.key === reason);

export const reasonLabel = (key: string) => [...REPORT_REASONS, ...CHANGE_REASONS].find((r) => r.key === key)?.label ?? key;

export function readReport(
  body: unknown,
): { ok: true; value: { targetType: ReportTarget; targetId: string; reason: ReportReason; note: string | null } } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const targetType = b.targetType;
  if (targetType !== "checkin" && targetType !== "user" && targetType !== "snack") return { ok: false, error: "Report what?" };
  if (typeof b.targetId !== "string" || !b.targetId || b.targetId.length > 64) return { ok: false, error: "Report what?" };
  const reason =
    REPORT_REASONS.find((r) => r.key === b.reason)?.key ??
    (targetType === "snack" ? CHANGE_REASONS.find((r) => r.key === b.reason)?.key : undefined);
  if (!reason) return { ok: false, error: "Pick a reason." };
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) || null : null;
  if (isChangeRequest(reason) && !note) return { ok: false, error: "Say what should change." };
  return { ok: true, value: { targetType, targetId: b.targetId, reason, note } };
}
