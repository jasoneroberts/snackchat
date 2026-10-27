-- Hearts on check-ins. One row per person per check-in they've liked, so
-- liking twice does nothing. Deleting the check-in or the person removes
-- their likes with them.
CREATE TABLE likes (
  checkin_id  TEXT NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (checkin_id, user_id)
);
-- For "what has this person liked" (their data export) and deleting accounts.
CREATE INDEX likes_by_user ON likes (user_id);
