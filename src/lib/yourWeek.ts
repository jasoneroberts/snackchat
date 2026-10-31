// Words for the "Your week" card (src/components/YourWeekCard.tsx), kept
// apart from the component so the tests can check them.

import type { YourWeek } from "../../shared/types";
import { rating } from "./format";

/** Monday on a UK clock, when the card shows. */
export function isUkMonday(date = new Date()): boolean {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" }).format(date) === "Mon";
}

/** "Sam", "Sam and Dave", "Sam, Dave and 3 others". */
export function names(list: string[], total: number): string {
  const rest = total - list.length;
  if (rest > 0) return `${list.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`;
  return list.length === 2 ? `${list[0]} and ${list[1]}` : (list[0] ?? "");
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The card's lines, in the reader's voice. Empty when nothing happened. */
export function weekLines(week: YourWeek, lad: boolean): { icon: string; text: string; href?: string }[] {
  const lines: { icon: string; text: string; href?: string }[] = [];
  if (week.likes > 0) {
    lines.push({ icon: "❤️", text: `${plural(week.likes, lad ? "heart" : "like", lad ? "hearts" : "likes")} from ${names(week.likers, week.likerCount)}`, href: "/me" });
  }
  if (week.checkins > 0) lines.push({ icon: "🍟", text: `You ${lad ? "put away" : "logged"} ${plural(week.checkins, "snack", "snacks")}` });
  if (week.squadCheckins > 0) {
    const best = week.best ? `. Best: ${week.best.poster}'s ${week.best.snack}, ${rating(week.best.overall)}★` : "";
    lines.push({
      icon: "👥",
      text: `${lad ? "The squad put away" : "Your squads logged"} ${plural(week.squadCheckins, "snack", "snacks")}${best}`,
      href: week.best ? `/snack/${encodeURIComponent(week.best.snackId)}` : "/groups",
    });
  }
  return lines;
}
