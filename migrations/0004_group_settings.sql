-- Group settings from the "Start a group" screen: when the leaderboard resets,
-- and which snack types count (NULL means all of them).

ALTER TABLE groups ADD COLUMN reset_period TEXT NOT NULL DEFAULT 'weekly'
  CHECK (reset_period IN ('weekly', 'monthly', 'never'));
ALTER TABLE groups ADD COLUMN categories TEXT; -- JSON array of category ids, or NULL for all
