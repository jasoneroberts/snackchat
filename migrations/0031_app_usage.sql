-- App usage, for the admin Stats page (Settings > Stats).
-- One row per person, per day, per thing they did that isn't already stored
-- somewhere else: opening the app, playing Wing It, sharing. Check-ins,
-- likes, votes and so on already have their own tables with times on them,
-- so the Stats page counts those directly.
--
-- day is whole days since 1970 (UTC), so a day's row is found with
-- unixepoch() / 86400. "open" is written at most once a day (times stays 1,
-- so it counts days the app was opened); the others add 1 each time.
-- Deleting the person deletes their rows.
CREATE TABLE app_usage (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      INTEGER NOT NULL,
  feature  TEXT NOT NULL,
  times    INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, day, feature)
);
-- The Stats page reads by day across everyone.
CREATE INDEX app_usage_day ON app_usage (day, feature);
