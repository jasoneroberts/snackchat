-- Likes on the thin "X joined Crunchd" lines in the feed, so people can
-- welcome new members. One row per liker per new member, so liking twice
-- does nothing. Deleting either person removes the like with them.
CREATE TABLE welcome_likes (
  member_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- the person who joined
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- the person who liked it
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (member_id, user_id)
);
-- For "what has this person liked" (their data export).
CREATE INDEX welcome_likes_by_user ON welcome_likes (user_id);
-- The feed looks up joins by time.
CREATE INDEX users_by_created ON users (created_at);
