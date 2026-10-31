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
