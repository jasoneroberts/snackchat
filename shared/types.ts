// Shapes the API sends back, shared so the front end and Worker agree.
import type { AchievementsPage } from "./achievements";

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
  likes: number; // hearts from people the viewer can see
  liked: boolean; // whether the viewer has hearted it
}

/** Someone who hearted a check-in. */
export interface Liker {
  username: string;
  avatarId: string | null;
  likedAt: number; // Unix seconds
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

/** A snack's confirmed diet labels: true, false, or null if not checked or not known. */
export interface DietLabels {
  vegan: boolean | null;
  glutenFree: boolean | null;
}

export interface SnackPage {
  snack: SnackSummary & DietLabels & { country: string };
  count: number;
  avg: number | null;
  attributes: Record<string, number>;
  rank: { position: number; of: number } | null;
  checkins: FeedItem[];
}

export interface ProfilePage {
  profile: { id: string; username: string; avatarId: string | null; country: string; joinedAt: number };
  private: boolean;
  /** "you": you've blocked them. "hidden": they've blocked you. */
  blocked: "you" | "hidden" | null;
  stats?: { checkins: number; snacks: number; avg: number | null; points: number };
  checkins?: FeedItem[];
  /** Badges and weekly streak (shared/achievements.ts). */
  achievements?: AchievementsPage;
}

/** One snack someone has checked in, with their own ratings of it. */
export interface TriedSnack {
  snack: SnackSummary;
  times: number; // how many times they've checked it in
  latest: number; // their most recent overall rating
  best: number; // their highest overall rating
  lastAt: number; // Unix seconds of their latest check-in
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
  pictureId: string | null;
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
    pictureId: string | null;
  };
  myRole: "owner" | "admin" | "member";
  periodEnd: number | null; // Unix seconds, null when the board never resets
  board: BoardRow[];
  /** Last Monday-to-Sunday week's top scorer(s), who wear a crown; empty if nobody scored. */
  champions: { username: string; value: number }[];
  /** True when the champion tied on score and won by getting there first. */
  championTie: boolean;
  favourite: (SnackSummary & { avg: number; checkins: number }) | null;
}

export interface GroupPreview {
  id: string;
  name: string;
  members: number;
  pictureId: string | null;
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
  /** True when a lone rating is averaged with the stand-in 2.5 (month and all time). */
  provisional: boolean;
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
}

// Your taste for one snack type: 1-5 per slider that type is rated on; a missing key means "don't mind".
export type Preferences = Partial<Record<string, number>>;

export interface Suggestion {
  snack: SnackSummary;
  match: number; // 0 to 1
  avg: number; // overall rating
  count: number; // check-ins
  averages: Record<string, number>; // everyone's average for each slider
}

export interface ExplorePage {
  tastes: Record<string, Preferences>; // by snack type id; types you haven't set are missing
  suggestions: Suggestion[];
  saved: SnackSummary[];
  discarded: SnackSummary[]; // "Ignore"d suggestions, newest first
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

// Admin: Users page.
export interface AdminUserRow {
  id: string;
  username: string;
  avatarId: string | null;
  isAdmin: boolean;
  isDemo: boolean;
  joinedAt: number;
  signupRef: string | null; // the ?ref= they arrived with (shared/ref.ts)
  invitedBy: string | null; // whose invite link they joined from (worker/lib/referrals.ts)
  lastActive: number | null; // newest sign-in or check-in
  checkins: number;
  points: number;
  groups: number;
}

// Admin: Snacks page.
export interface AdminSnackRow {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  status: "pending" | "approved" | "rejected";
  checkins: number;
  photoId: string | null;
  addedBy: string | null; // username of whoever added it; null for the built-in catalogue
  createdAt: number;
}

export interface AdminSnackPhoto {
  id: string;
  username: string;
  createdAt: number;
  isCover: boolean; // picked as the snack's main picture
}

// Admin: Diet check page.
export interface DietRow extends DietLabels {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  checkedAt: number | null;
  photoId: string | null;
}

// Admin Health page --------------------------------------------------------

export interface ErrorRow {
  id: number;
  source: "client" | "server";
  message: string;
  detail: string | null;
  path: string | null;
  username: string | null;
  userAgent: string | null;
  createdAt: number;
}

export interface AuditRow {
  id: number;
  adminName: string;
  method: string;
  path: string;
  status: number;
  detail: string | null;
  createdAt: number;
}

export interface BackupRow {
  name: string; // 2026-10-25.json
  bytes: number;
  createdAt: number;
}

export interface HealthSummary {
  errorsLastHour: number;
  errorsLastDay: number;
  alertThreshold: number;
  alertsTo: string[];
  emailMode: "log" | "resend";
  errors: ErrorRow[];
  audit: AuditRow[];
  backups: BackupRow[];
}

// Admin Reports page: one entry per reported thing, with every report about it.
export interface AdminReport {
  targetType: "checkin" | "user" | "snack";
  targetId: string;
  reports: { reason: string; note: string | null; reporter: string; createdAt: number }[];
  checkin?: {
    username: string;
    snackName: string;
    review: string | null;
    venue: string | null;
    pairedWith: string | null;
    photoId: string | null;
    createdAt: number;
  };
  user?: { username: string; avatarId: string | null; checkins: number; joinedAt: number; isAdmin: boolean };
  snack?: { id: string; name: string; brand: string | null; status: string };
}

/** One of your own check-ins, loaded to edit it. */
export interface CheckinForEdit {
  id: string;
  snack: SnackSummary;
  overall: number;
  attributes: Record<string, number>;
  review: string | null;
  venue: string | null;
  pairedWith: string | null;
  photo: { id: string; status: "visible" | "pending" } | null;
}

// Your profile's "Invite friends" card (GET /api/account/invites).
export interface InviteStats {
  friends: { username: string; avatarId: string | null; checkedIn: boolean; points: number }[];
  joined: number;
  checkedIn: number;
  points: number; // invite points earned so far
}
