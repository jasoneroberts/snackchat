// Achievements (badges), weekly streaks and Crisp of the Week: the parts the
// app and the server both need. The server works out who has earned what
// (worker/lib/achievements.ts); the app shows them (src/components/Achievements.tsx).

/**
 * What a badge counts. Each one is a number worked out from someone's
 * check-ins, likes, squads and votes (see `progressFor` in
 * worker/lib/achievements.ts). A badge is earned when its metric reaches `goal`.
 */
export type Metric =
  | "checkins" // check-ins that count (scored = 1)
  | "snacks" // different snacks
  | "crisps" // different crisps
  | "sweets" // different chocolate and sweets
  | "world" // different world snacks
  | "types" // different snack types tried
  | "late" // check-ins between midnight and 4am, UK time
  | "early" // check-ins between 5am and 8am, UK time
  | "reviews" // reviews long enough to earn the review bonus
  | "photos" // photos approved and showing
  | "hearts" // hearts on your check-ins from other people
  | "squads" // squads you're in
  | "invites" // friends who joined from your invite link
  | "scampi_low" // times you rated Scampi Fries 2 or under
  | "scampi_high" // times you rated Scampi Fries 4.5 or more
  | "streak" // best weekly streak ever
  | "votes" // Crisp of the Week votes
  | "backed" // Crisp of the Week winners you voted for
  | "secret"; // never counted: given out by a hidden game (see SECRET_BADGES)

export interface BadgeDef {
  id: string;
  name: string;
  /** Shown on the badge. Phones draw these in colour, also on the share picture. */
  emoji: string;
  /** How to get it, said plainly. Hidden badges show "???" until earned. */
  description: string;
  metric: Metric;
  goal: number;
  /** Not listed until someone earns it. */
  hidden?: boolean;
}

// The order here is the order on the profile.
export const BADGES: BadgeDef[] = [
  { id: "first_crunch", name: "First Crunch", emoji: "🥔", description: "Log your first snack.", metric: "checkins", goal: 1 },
  { id: "regular", name: "Regular", emoji: "🍺", description: "Log 10 check-ins.", metric: "checkins", goal: 10 },
  { id: "centurion", name: "Centurion", emoji: "💯", description: "Log 100 check-ins.", metric: "checkins", goal: 100 },
  { id: "crisp_connoisseur", name: "Crisp Connoisseur", emoji: "🎩", description: "Try 25 different crisps.", metric: "crisps", goal: 25 },
  { id: "sweet_tooth", name: "Sweet Tooth", emoji: "🍫", description: "Try 10 different chocolates and sweets.", metric: "sweets", goal: 10 },
  { id: "globetrotter", name: "Globetrotter", emoji: "🌍", description: "Try 5 different world snacks.", metric: "world", goal: 5 },
  { id: "all_rounder", name: "All-Rounder", emoji: "🎯", description: "Try snacks from 5 different snack types.", metric: "types", goal: 5 },
  { id: "explorer", name: "Snack Explorer", emoji: "🧭", description: "Try 50 different snacks.", metric: "snacks", goal: 50 },
  { id: "night_owl", name: "Night Owl", emoji: "🦉", description: "Log a snack between midnight and 4am.", metric: "late", goal: 1 },
  { id: "early_bird", name: "Breakfast of Champions", emoji: "🌅", description: "Log a snack between 5am and 8am.", metric: "early", goal: 1 },
  { id: "critic", name: "The Critic", emoji: "🖋️", description: "Write 10 proper reviews (50 characters or more).", metric: "reviews", goal: 10 },
  { id: "snap_happy", name: "Snap Happy", emoji: "📸", description: "Get 10 photos approved.", metric: "photos", goal: 10 },
  { id: "fan_favourite", name: "Fan Favourite", emoji: "❤️", description: "Get 25 hearts on your check-ins.", metric: "hearts", goal: 25 },
  { id: "squad_up", name: "Squad Up", emoji: "🤝", description: "Join or start a squad.", metric: "squads", goal: 1 },
  { id: "squad_captain", name: "Squad Captain", emoji: "🧢", description: "Get 5 friends to join with your invite link.", metric: "invites", goal: 5 },
  { id: "scampi_sceptic", name: "Scampi Fries Sceptic", emoji: "🤨", description: "Rate Scampi Fries 2 stars or under.", metric: "scampi_low", goal: 1 },
  { id: "scampi_disciple", name: "Scampi Fries Disciple", emoji: "🦐", description: "Rate Scampi Fries 4.5 stars or more.", metric: "scampi_high", goal: 1 },
  { id: "on_a_roll", name: "On a Roll", emoji: "🔥", description: "Check in 4 weeks in a row.", metric: "streak", goal: 4 },
  { id: "crunch_machine", name: "Crunch Machine", emoji: "⚙️", description: "Check in 12 weeks in a row.", metric: "streak", goal: 12 },
  { id: "swing_voter", name: "Swing Voter", emoji: "🗳️", description: "Vote in 3 Crisp of the Week battles.", metric: "votes", goal: 3 },
  { id: "kingmaker", name: "Kingmaker", emoji: "👑", description: "Back the Crisp of the Week winner 3 times.", metric: "backed", goal: 3 },
  {
    id: "golden_crisp",
    name: "Golden Crisp",
    emoji: "🌟",
    description: "Caught the Golden Crisp in Wing It.",
    metric: "secret",
    goal: 1,
    hidden: true,
  },
];

/** Badges a hidden game gives out itself (POST /api/achievements/secret/:id). */
export const SECRET_BADGES = new Set(BADGES.filter((b) => b.metric === "secret").map((b) => b.id));

export const badgeById = (id: string) => BADGES.find((b) => b.id === id);

/** One badge as the app shows it. `progress` is null for hidden ones. */
export interface BadgeState {
  id: string;
  name: string;
  emoji: string;
  description: string;
  goal: number;
  progress: number | null;
  earnedAt: number | null;
}

export interface Streak {
  /** Weeks in a row with a check-in, up to this week (or last week, if this week has none yet). */
  current: number;
  best: number;
  /** Checked in this week already, so the streak is safe until next Monday. */
  thisWeek: boolean;
}

export interface AchievementsPage {
  streak: Streak;
  badges: BadgeState[];
}

// Weeks ---------------------------------------------------------------------
// Weeks run Monday to Sunday in UTC, like the Table's "This week"
// (worker/lib/groups.ts periodStart). In UK summer time that means a week
// turns over at 1am on Monday rather than midnight, which nobody will notice.

const DAY = 86400;

/** Which week a moment falls in, counting Monday-to-Sunday weeks since 1970 (which began on a Thursday). */
export const weekNumber = (seconds: number) => Math.floor((Math.floor(seconds / DAY) + 3) / 7);

/** When week `n` starts (Monday 00:00 UTC), in seconds. */
export const weekStartOf = (n: number) => (n * 7 - 3) * DAY;

/**
 * Streaks from the weeks someone checked in. A streak is still alive if the
 * last week with a check-in is this week or last week: you have until Sunday
 * night to keep it going.
 */
export function streakFrom(weeks: Iterable<number>, nowSeconds: number): Streak {
  const set = new Set(weeks);
  const thisWeek = weekNumber(nowSeconds);
  const sorted = [...set].sort((a, b) => a - b);

  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }

  let current = 0;
  let w = set.has(thisWeek) ? thisWeek : thisWeek - 1;
  while (set.has(w)) {
    current++;
    w--;
  }
  return { current, best, thisWeek: set.has(thisWeek) };
}

/** The hour (0 to 23) on a UK clock at a moment, summer time included. */
export function ukHour(seconds: number): number {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hourCycle: "h23" }).format(
    new Date(seconds * 1000),
  );
  return Number(hour) % 24;
}

export const isLate = (seconds: number) => ukHour(seconds) < 4;
export const isEarly = (seconds: number) => {
  const h = ukHour(seconds);
  return h >= 5 && h < 8;
};

// Crisp of the Week ------------------------------------------------------------

export interface BattleSnack {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  photoId: string | null;
}

export interface Battle {
  weekStart: number;
  /** When voting closes: next Monday, 00:00 UTC. */
  endsAt: number;
  a: BattleSnack;
  b: BattleSnack;
  /** Vote counts. Only sent once you've voted, so nobody just follows the crowd. Always sent for past battles. */
  votes: { a: number; b: number } | null;
  myVote: string | null;
  /** For past battles: the winner's id, or null for a dead heat. */
  winner?: string | null;
}

export interface BattlePage {
  current: Battle | null;
  last: Battle | null;
}

/** Whole-number percentages that add up to 100 (or both 0 with no votes). */
export function percentages(a: number, b: number): { a: number; b: number } {
  const total = a + b;
  if (total === 0) return { a: 0, b: 0 };
  const pa = Math.round((a / total) * 100);
  return { a: pa, b: 100 - pa };
}
