/**
 * The days the "last week" cards (Last week's champions, Your week) sit at
 * the top of the feed: Monday and Tuesday on a UK clock. Two days so people
 * who don't open the app on a Monday still catch the round-up. Both days
 * still look back at the same Monday-to-Sunday week, because the worker
 * works out "last week" from the start of the current week, not from today.
 */
const RECAP_DAYS = new Set(["Mon", "Tue"]);

export function isRecapDay(date = new Date()): boolean {
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" }).format(date);
  return RECAP_DAYS.has(day);
}
