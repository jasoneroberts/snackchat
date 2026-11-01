// A squad's scores between two times, by its own scoring mode and snack
// types. The live squad table (routes/groups.ts) uses it "up to now"; the
// crowns (lib/champions.ts) use it for last week.

import type { BoardRow, ScoringMode } from "../../shared/types";
import { invitePointsSql } from "./referrals";

export interface SquadRef {
  id: string;
  scoring_mode: ScoringMode;
  categories: string | null;
}

export interface ScoreRow {
  userId: string;
  username: string;
  avatarId: string | null;
  role: BoardRow["role"];
  value: number;
  /** When they last checked in something that counts here, in the window. Breaks ties: earlier wins. */
  lastAt: number | null;
}

// Bind order: ?1 squad id, ?2 from, ?3 the squad's snack types as JSON (or
// NULL for all), ?4 up to but not including (NULL for "up to now").
// Only check-ins of the squad's snack types count.
const COUNTS = `(s.category_id IN (SELECT value FROM json_each(?3)) OR ?3 IS NULL)`;
const WINDOW = (col: string) => `${col} >= ?2 AND (?4 IS NULL OR ${col} < ?4)`;

// What each scoring mode adds up for one member (m.user_id).
const SCORE_SQL: Record<ScoringMode, string> = {
  points: `(SELECT COALESCE(SUM(pl.points), 0) FROM points_ledger pl
             JOIN checkins c ON c.id = pl.checkin_id JOIN snacks s ON s.id = c.snack_id
            WHERE pl.user_id = m.user_id AND ${WINDOW("pl.created_at")} AND c.scored = 1 AND ${COUNTS})${invitePointsSql("m.user_id", "?2", "?4")}`,
  checkins: `SELECT COUNT(*) FROM checkins c JOIN snacks s ON s.id = c.snack_id
              WHERE c.user_id = m.user_id AND ${WINDOW("c.created_at")} AND c.scored = 1 AND ${COUNTS}`,
  unique: `SELECT COUNT(DISTINCT c.snack_id) FROM checkins c JOIN snacks s ON s.id = c.snack_id
            WHERE c.user_id = m.user_id AND ${WINDOW("c.created_at")} AND c.scored = 1 AND ${COUNTS}`,
};

const LAST_AT = `SELECT MAX(c.created_at) FROM checkins c JOIN snacks s ON s.id = c.snack_id
                  WHERE c.user_id = m.user_id AND ${WINDOW("c.created_at")} AND c.scored = 1 AND ${COUNTS}`;

/** The statement for every current member's score; run it alone or in a batch. */
export function squadScoresStatement(db: D1Database, g: SquadRef, since: number, until: number | null) {
  return db
    .prepare(
      `SELECT u.id AS userId, u.username, u.avatar_id AS avatarId, m.role,
              (${SCORE_SQL[g.scoring_mode]}) AS value, (${LAST_AT}) AS lastAt
         FROM group_members m JOIN users u ON u.id = m.user_id
        WHERE m.group_id = ?1`,
    )
    .bind(g.id, since, g.categories, until);
}

/** Every current member's score between two times (until = null means up to now). */
export async function squadScores(db: D1Database, g: SquadRef, since: number, until: number | null): Promise<ScoreRow[]> {
  return (await squadScoresStatement(db, g, since, until).all<ScoreRow>()).results;
}
