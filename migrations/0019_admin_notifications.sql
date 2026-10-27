-- Admin notifications: phones that asked for push messages, the server's own
-- push signing key, and when each admin last looked at the Users list (so
-- new sign-ups can be counted).

CREATE TABLE push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);

-- One row per key, made by the Worker the first time it's needed.
CREATE TABLE app_keys (
  name  TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE users ADD COLUMN users_seen_at INTEGER;
