// What people can report, and why. Admins see reports in Settings > Reports.

export type ReportTarget = "checkin" | "user" | "snack";

export const REPORT_REASONS = [
  { key: "rude", label: "Rude, hateful or bullying" },
  { key: "sexual", label: "Sexual or not safe for work" },
  { key: "spam", label: "Spam or advertising" },
  { key: "wrong", label: "Wrong snack, wrong photo or not a snack" },
  { key: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["key"];

export const reasonLabel = (key: string) => REPORT_REASONS.find((r) => r.key === key)?.label ?? key;

export function readReport(
  body: unknown,
): { ok: true; value: { targetType: ReportTarget; targetId: string; reason: ReportReason; note: string | null } } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const targetType = b.targetType;
  if (targetType !== "checkin" && targetType !== "user" && targetType !== "snack") return { ok: false, error: "Report what?" };
  if (typeof b.targetId !== "string" || !b.targetId || b.targetId.length > 64) return { ok: false, error: "Report what?" };
  const reason = REPORT_REASONS.find((r) => r.key === b.reason)?.key;
  if (!reason) return { ok: false, error: "Pick a reason." };
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 300) || null : null;
  return { ok: true, value: { targetType, targetId: b.targetId, reason, note } };
}
