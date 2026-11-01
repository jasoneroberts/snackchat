// Which badges this phone has already told you about, so the "New badge!"
// popup (components/BadgePopup.tsx) only shows each one once. Kept in
// localStorage: on a new phone the popup starts afresh (see BadgePopup for
// how it avoids popping up everything you already had).
//
// Screens that already make a fuss of a new badge (the check-in screen,
// Wing It, the Golden Crisp) mark it seen themselves, so it doesn't pop up
// a second time.

const KEY = "crunchd.badgesSeen";
// Set once the popup has quietly marked the badges you already had (the
// first time it ran on this phone). Separate from the list, because other
// screens can add to the list before the popup's first look.
const STARTED = "crunchd.badgesSeenStarted";

/** The ids already shown on this phone. */
export function seenBadges(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Has the popup looked on this phone before? */
export function badgesStarted(): boolean {
  try {
    return localStorage.getItem(STARTED) === "1";
  } catch {
    return true; // Storage blocked: don't flood them with every badge they hold.
  }
}

export function markBadgesStarted() {
  try {
    localStorage.setItem(STARTED, "1");
  } catch {
    // Nothing to do.
  }
}

export function markBadgesSeen(ids: Iterable<string>) {
  try {
    const seen = seenBadges();
    for (const id of ids) seen.add(id);
    localStorage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    // Storage blocked (private browsing): the popup may repeat itself, no harm.
  }
}

/** Ask the popup to look for new badges now, e.g. straight after something that might have earned one. */
export function checkBadgesSoon() {
  window.dispatchEvent(new Event("crunchd:badges"));
}
