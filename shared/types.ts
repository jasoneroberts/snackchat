// Shapes the API sends back, shared so the front end and Worker agree.

export interface FeedItem {
  id: string;
  username: string;
  snack: { id: string; name: string; brand: string | null; category: string; status: string };
  overall: number;
  review: string | null;
  venue: string | null;
  pairedWith: string | null;
  attributes: Record<string, number>;
  photoId: string | null;
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
  profile: { username: string; country: string; joinedAt: number };
  private: boolean;
  stats?: { checkins: number; snacks: number; avg: number | null; points: number };
  taste?: Record<string, number>;
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
