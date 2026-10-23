// Shapes the API sends back, shared so the front end and Worker agree.

export interface FeedItem {
  id: string;
  username: string;
  avatarId: string | null;
  snack: { id: string; name: string; brand: string | null; category: string; status: string };
  overall: number;
  review: string | null;
  venue: string | null;
  pairedWith: string | null;
  attributes: Record<string, number>;
  photoId: string | null;
  photoPending: boolean; // only ever true on your own check-ins
  points: number;
  createdAt: number; // Unix seconds
}

export interface SnackSummary {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  status: string; // "approved" or "pending"
  checkins?: number;
  avg?: number | null;
  photoId?: string | null; // newest community photo, used as the thumbnail
}

export interface SnackPage {
  snack: SnackSummary & { country: string };
  count: number;
  avg: number | null;
  attributes: Record<string, number>;
  rank: { position: number; of: number } | null;
  checkins: FeedItem[];
}

export interface ProfilePage {
  profile: { username: string; avatarId: string | null; country: string; joinedAt: number };
  private: boolean;
  stats?: { checkins: number; snacks: number; avg: number | null; points: number };
  preferences?: Preferences | null; // their taste profile, as set on Explore
  checkins?: FeedItem[];
}

export type ScoringMode = "points" | "unique" | "checkins";
export type ResetPeriod = "weekly" | "monthly" | "never";

export interface GroupCard {
  id: string;
  name: string;
  members: number;
  scoringMode: ScoringMode;
  resetPeriod: ResetPeriod;
  myRank: number | null;
}

export interface BoardRow {
  username: string;
  avatarId: string | null;
  value: number;
  rank: number;
  role: "owner" | "admin" | "member";
}

export interface GroupPage {
  group: {
    id: string;
    name: string;
    inviteCode: string;
    scoringMode: ScoringMode;
    resetPeriod: ResetPeriod;
    categories: string[] | null;
    createdAt: number;
  };
  myRole: "owner" | "admin" | "member";
  periodEnd: number | null; // Unix seconds, null when the board never resets
  board: BoardRow[];
  favourite: (SnackSummary & { avg: number; checkins: number }) | null;
}

export interface GroupPreview {
  id: string;
  name: string;
  members: number;
  isMember: boolean;
  full: boolean;
}

export type BoardPeriod = "week" | "month" | "all";
export type PeopleMetric = "points" | "checkins" | "snacks";

export interface PeopleRow {
  username: string;
  avatarId: string | null;
  points: number;
  checkins: number;
  snacks: number;
  value: number; // the chosen metric
  rank: number;
}

export interface SnackRow {
  snack: SnackSummary;
  avg: number;
  count: number;
  rank: number;
}

export interface ReviewQueue {
  photos: { id: string; username: string; snackName: string; review: string | null; createdAt: number }[];
  avatars: { userId: string; username: string; avatarId: string; currentId: string | null }[];
}

export interface DemoStatus {
  users: number;
  checkins: number;
  photos: number;
  missingPhotos: string[]; // demo snacks with no photo yet
}

// Taste preferences: 1-5 per TASTE slider (universal plus spice); a missing key means "don't mind".
export type Preferences = Partial<Record<string, number>>;

export interface Suggestion {
  snack: SnackSummary;
  match: number; // 0 to 1
  avg: number; // overall rating
  count: number; // check-ins
  averages: Record<string, number>; // everyone's average for each slider
}

export interface ExplorePage {
  preferences: Preferences | null;
  suggestions: Suggestion[];
  saved: SnackSummary[];
}

export interface BrandRow {
  brand: string;
  snacks: number;
  logoId: string | null;
}

export interface LogoSuggestion {
  suggestion: { url: string; source: "wikidata" | "website"; label: string } | null;
  more: number; // how many other suggestions are left after this one
}
