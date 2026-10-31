-- Crisp of the Week: each week two snacks go head to head and everyone gets
-- one vote (which they can change until the week ends). The battle for a
-- week is picked the first time anyone opens it (worker/lib/battle.ts).
-- week_start is that Monday at 00:00 UTC, in Unix seconds.
-- result_sent is set once the "here's who won" push has gone to the voters.
CREATE TABLE cotw_battles (
  week_start   INTEGER PRIMARY KEY,
  snack_a      TEXT NOT NULL REFERENCES snacks(id),
  snack_b      TEXT NOT NULL REFERENCES snacks(id),
  created_at   INTEGER NOT NULL,
  result_sent  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE cotw_votes (
  week_start  INTEGER NOT NULL REFERENCES cotw_battles(week_start) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snack_id    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (week_start, user_id)
);
-- For badges ("Swing Voter", "Kingmaker") and the data export.
CREATE INDEX cotw_votes_by_user ON cotw_votes (user_id);

-- Badges already have tables (badges, user_badges in 0001_init.sql); the
-- list of badges lives in shared/achievements.ts and rows in "badges" are
-- added as they're first earned. Streaks are worked out from check-ins, so
-- they need nothing stored.
