import type { ResetPeriod, ScoringMode } from "../../shared/types";

export const MODE_CHOICES: { id: ScoringMode; label: string; desc: string; unit: string }[] = [
  { id: "points", label: "Points", desc: "New snacks, photos and reviews all score. Rewards effort.", unit: "pts" },
  { id: "unique", label: "Most different snacks", desc: "Only new-to-you snacks count. Rewards variety.", unit: "snacks" },
  { id: "checkins", label: "Most check-ins", desc: "Every check-in counts, repeats too. Rewards volume.", unit: "check-ins" },
];

export const RESET_CHOICES: { id: ResetPeriod; label: string; board: string }[] = [
  { id: "weekly", label: "Every Monday", board: "This week" },
  { id: "monthly", label: "Every month", board: "This month" },
  { id: "never", label: "Never", board: "All time" },
];

export const modeOf = (id: ScoringMode) => MODE_CHOICES.find((m) => m.id === id)!;
export const resetOf = (id: ResetPeriod) => RESET_CHOICES.find((r) => r.id === id)!;

/** "Resets in 3 days", "Resets tomorrow", "Resets in 5 hours". */
export function resetsIn(endSeconds: number | null, now = Date.now()): string | null {
  if (endSeconds === null) return null;
  const hours = Math.max(0, Math.ceil((endSeconds * 1000 - now) / 3_600_000));
  if (hours < 24) return `Resets in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.ceil(hours / 24);
  return days === 1 ? "Resets tomorrow" : `Resets in ${days} days`;
}

/** The page people land on from an invite link. In a chat it shows the squad's own preview card (worker/lib/linkPreview.ts). */
export const inviteLink = (code: string) => `${window.location.origin}/join/${code}`;

/** What goes in the chat with an invite link. The link goes last so WhatsApp shows its preview card. */
export const inviteMessage = (groupName: string, code: string) =>
  `Join my snack squad "${groupName}" on Crunchd. Rate what you're eating and let's see who tops the table: ${inviteLink(code)}`;

/** Opens WhatsApp (the app on phones, the website on computers) with the invite ready to send to a group chat. */
export const whatsAppInvite = (groupName: string, code: string) =>
  `https://wa.me/?text=${encodeURIComponent(inviteMessage(groupName, code))}`;

export const ordinal = (n: number) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};
