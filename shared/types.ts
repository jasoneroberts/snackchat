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
