// Where a new person heard about Crunchd, from the ?ref= on the link they
// first opened: getcrunchd.com/?ref=pub (the pub QR stickers), ?ref=tiktok
// on an ad, ?ref=share on a shared check-in picture, ?ref=squad on a squad
// invite. Saved on their account at sign-up and counted in Settings > Users.

/** Lower case letters, numbers, "-" and "_", up to 32 long. Anything else is dropped. */
export function cleanRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ref = value.trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(ref) ? ref : null;
}

/** How a ref reads in the admin list: "pub", "tiktok", or "no link" for people who came straight in. */
export const refLabel = (ref: string | null) => ref ?? "no link";

// Personal invite links: getcrunchd.com/?ref=friend&by=jase. "ref" is the
// kind of link (as above); "by" is the person who sent it, who earns points
// when the friend joins and again after their first check-in
// (worker/lib/referrals.ts).

/** A username from a ?by= link, or null if it can't be one. */
export function cleanInviter(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return /^[a-zA-Z0-9_]{3,20}$/.test(name) ? name : null;
}

export const INVITE_POINTS = {
  join: 5, // a friend makes an account from your link
  firstCheckin: 15, // ...and then checks in for the first time
  friendsPerDay: 5, // each bonus is paid for at most this many friends a day
  // Whether invite points count on the people and squad points tables (not
  // just your total). On while Crunchd is small; set to false if fake
  // accounts ever show up to farm them.
  onBoards: true,
} as const;
