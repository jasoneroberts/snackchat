// Lad mode and grown-up mode: the same app in two voices.
//
// A voice changes only the app's own words (and, through CSS, its colours).
// Snacks, ratings, points and boards are identical in both, and people's
// reviews are never rewritten.
//
// Each line has a grown-up version and, where it's worth it, a lad version.
// Lad lines can say {snack}, {Snack} or {snacking}: those become "crunch" for
// crunchy snack types and "munch" for the rest. Any line can take {n}-style
// values passed in `vars`. A line with no lad version falls back to grown-up,
// so nothing ever shows blank.

export type Voice = "grownup" | "lad";
export const VOICES: Voice[] = ["grownup", "lad"];

export const isVoice = (v: unknown): v is Voice => v === "grownup" || v === "lad";

interface Line {
  grownup: string;
  lad?: string;
}

export const LINES = {
  // Tab bar
  "tab.feed": { grownup: "Feed", lad: "Feed" },
  "tab.boards": { grownup: "Boards", lad: "The Table" },
  "tab.checkin": { grownup: "Check in", lad: "Log it" },
  "tab.explore": { grownup: "Explore", lad: "Hunt" },
  "tab.groups": { grownup: "Groups", lad: "Squads" },
  "tab.profile": { grownup: "Profile", lad: "Me" },

  // Page titles in the top bar
  "title.checkin": { grownup: "Check in", lad: "Log the {snack}" },
  "title.boards": { grownup: "Boards", lad: "The Table" },
  "title.explore": { grownup: "Explore", lad: "The Hunt" },
  "title.groups": { grownup: "Groups", lad: "Squads" },
  "title.newGroup": { grownup: "New group", lad: "New squad" },
  "title.editGroup": { grownup: "Group settings", lad: "Squad settings" },
  "title.group": { grownup: "Group", lad: "Squad" },

  // Feed
  "feed.emptyTitle": { grownup: "Nothing here yet", lad: "Dead in here" },
  "feed.emptyBody": { grownup: "Be the first to check in a snack.", lad: "Nobody's had a {snack} yet. Shameful." },
  "feed.emptyButton": { grownup: "Check in a snack", lad: "Log the first {snack}" },
  "feed.older": { grownup: "Show older check-ins", lad: "Show more" },

  // A check-in card
  "card.checkedIn": { grownup: "checked in", lad: "had a {snack}" },
  "card.at": { grownup: "at {venue}", lad: "down {venue}" },
  "card.pairedWith": { grownup: "Paired with: {with}", lad: "Washed down with: {with}" },

  // Checking in
  "checkin.search": { grownup: "What are you snacking on?", lad: "What you {snacking}?" },
  "checkin.searchPlaceholder": { grownup: "Search snacks or brands", lad: "Search the {snack} or a brand" },
  "checkin.popular": { grownup: "Popular right now", lad: "Getting smashed right now" },
  "checkin.addMissing": { grownup: "Can't find it? Add “{q}”", lad: "Not on here? Get “{q}” on" },
  "checkin.addTitle": { grownup: "Add a new snack", lad: "Found a new one? Get it on" },
  "checkin.rating": { grownup: "Overall rating", lad: "Score it, be honest" },
  "checkin.describe": { grownup: "Describe it", lad: "Break it down" },
  "checkin.review": { grownup: "Review", lad: "Talk us through it" },
  "checkin.reviewPlaceholder": {
    grownup: "How was it? ({chars}+ characters earns +{pts} pts)",
    lad: "Go on then. ({chars}+ characters bags +{pts} pts)",
  },
  "checkin.where": { grownup: "Where?", lad: "Which boozer?" },
  "checkin.with": { grownup: "With?", lad: "Washed down with?" },
  "checkin.needRating": { grownup: "Give it a star rating", lad: "Score it first" },
  "checkin.submit": { grownup: "Check in", lad: "Log the {snack}" },
  "checkin.busy": { grownup: "Checking in…", lad: "{Snacking}…" },
  "checkin.photo": { grownup: "Add a photo (+{pts} pts)", lad: "Snap it (+{pts} pts)" },
  "toast.checkedIn": { grownup: "Checked in", lad: "Logged" },
  "toast.onBoard": { grownup: "{name} is on the board.", lad: "{name} is on the Table." },
  // The "Turn on notifications?" sheet (src/components/PushPrompt.tsx)
  "push.title": { grownup: "Turn on notifications?", lad: "Want a nudge?" },
  "push.body": {
    grownup: "Hear when someone likes your check-in, and get a nudge if you go {days} days without one. You can turn these off in Settings.",
    lad: "Hear when someone hearts your {snack}, and get a shout if you go {days} days without logging one. Turn it off in Settings whenever.",
  },
  "push.yes": { grownup: "Turn on", lad: "Go on then" },
  "push.no": { grownup: "Not now", lad: "Nah" },
  "share.prompt": { grownup: "Share it and see what your friends would give it.", lad: "Show the lads. Start the {snack} debate." },

  // Badges (src/components/Achievements.tsx). Lad mode calls them chieves.
  "badges.title": { grownup: "Badges", lad: "Chieves" },
  "badges.new": { grownup: "New badge!", lad: "New chieve!" },
  "badges.newNamed": { grownup: "New badge: {name}", lad: "New chieve: {name}" },
  "badges.cardTop": { grownup: "I earned a badge", lad: "I bagged a chieve" },
  "badges.shareText": { grownup: "I just earned the {name} badge on Crunchd", lad: "Just bagged the {name} chieve on Crunchd" },

  // Explore
  "explore.setTaste": { grownup: "What do you like?", lad: "What's your poison?" },
  "explore.yourTaste": { grownup: "Your taste", lad: "Your poison" },
  "explore.findSnacks": { grownup: "Find my snacks", lad: "Find me some {snack}" },
  "explore.suggestions": { grownup: "Try these next", lad: "Get these down you" },
  "explore.none": {
    grownup: "No more suggestions right now. Check back once more snacks have been rated.",
    lad: "You've cleared the lot. Check back when there's more {snack} about.",
  },
  "explore.save": { grownup: "Save to try", lad: "Bag it" },
  "explore.discard": { grownup: "Ignore", lad: "Ignore" },
  "explore.saved": { grownup: "Saved to try", lad: "Bagged for later" },
  "explore.rejected": { grownup: "Ignored", lad: "Ignored" },
  "explore.tried": { grownup: "Check in", lad: "Log it" },

  // Boards
  "boards.people": { grownup: "People", lad: "Lads" },
  "boards.snacks": { grownup: "Snacks", lad: "The {snack}" },
  "boards.everyone": { grownup: "Everyone", lad: "Everyone" },
  "boards.points": { grownup: "Points", lad: "{Snack} points" },
  "boards.empty": { grownup: "No check-ins yet for this board.", lad: "Nobody's on the Table yet." },
  "boards.emptyButton": { grownup: "Check in a snack", lad: "Get on it" },
  "boards.noSnacks": { grownup: "No rated snacks here yet.", lad: "Nothing scored here yet." },
  "boards.rateOne": { grownup: "Rate one now", lad: "Score one now" },
  "boards.you": { grownup: "(you)", lad: "(you, legend)" },

  // Groups
  "groups.title": { grownup: "Your groups", lad: "Your squads" },
  "groups.start": { grownup: "+ Start a group", lad: "+ Start a squad" },
  "groups.none": { grownup: "You're not in any groups yet.", lad: "No squad yet. Sort it out." },
  "groups.create": { grownup: "Create group", lad: "Create squad" },
  "groups.ready": { grownup: "Your group is ready. Now get people in.", lad: "Squad's sorted. Round up the lads." },
  "groups.favourite": { grownup: "Group's favourite snack", lad: "Squad's go-to {snack}" },

  // Profile
  "profile.recent": { grownup: "Recent check-ins", lad: "Latest {snack}" },
  "profile.none": { grownup: "No check-ins yet.", lad: "Not had a {snack} yet." },

  // Picking a voice
  "voice.grownup": { grownup: "Grown-up mode" },
  "voice.lad": { grownup: "Lad mode" },
} satisfies Record<string, Line>;

export type LineKey = keyof typeof LINES;

// Snack types that count as "crunch" in lad mode; everything else is "munch".
const CRUNCHY = new Set(["crisps", "nuts", "popcorn"]);

export interface LineOptions {
  /** The snack type the line is about. Kids snacks always get grown-up words. */
  category?: string;
  vars?: Record<string, string | number>;
}

/** One line of app text in the given voice. */
export function line(voice: Voice, key: LineKey, { category, vars }: LineOptions = {}): string {
  const entry: Line = LINES[key];
  // Parents rate kids snacks, often with the kid watching: keep those grown-up.
  const useLad = voice === "lad" && category !== "kids" && entry.lad !== undefined;
  let text = useLad ? entry.lad! : entry.grownup;
  if (useLad) {
    const word = !category || CRUNCHY.has(category) ? "crunch" : "munch";
    text = text
      .replaceAll("{snack}", word)
      .replaceAll("{Snack}", capitalise(word))
      .replaceAll("{snacking}", `${word}ing`)
      .replaceAll("{Snacking}", capitalise(`${word}ing`));
  }
  for (const [name, value] of Object.entries(vars ?? {})) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
