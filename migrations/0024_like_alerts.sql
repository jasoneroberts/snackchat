-- "Someone liked your check-in" push messages.
-- like_alerts: on for everyone unless they turn it off in Settings. It only
-- reaches people who've turned notifications on for a phone.
ALTER TABLE users ADD COLUMN like_alerts INTEGER NOT NULL DEFAULT 1;

-- One row per (check-in, person who liked it) we've already sent a push
-- about. Unlike and like again and the row is still here, so the owner isn't
-- buzzed twice for the same heart. Kept apart from likes because unliking
-- deletes the like row.
CREATE TABLE like_notices (
  checkin_id  TEXT NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
  liker_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (checkin_id, liker_id)
);
