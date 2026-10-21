-- Snackchat core schema.
-- Times are stored as Unix epoch seconds (INTEGER); ids are random text ids.

-- People ------------------------------------------------------------------

CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT,                       -- NULL for Google-only accounts
  email_verified  INTEGER NOT NULL DEFAULT 0,
  country         TEXT NOT NULL DEFAULT 'GB',
  is_private      INTEGER NOT NULL DEFAULT 0,
  is_admin        INTEGER NOT NULL DEFAULT 0,
  trust_level     INTEGER NOT NULL DEFAULT 0, -- 0 new, 1 established, 2 trusted
  created_at      INTEGER NOT NULL
);

-- The session id is the SHA-256 hash of the cookie value, so a leaked
-- database does not leak usable sessions.
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- One-time tokens for email verification (and later password reset).
CREATE TABLE email_tokens (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
  expires_at  INTEGER NOT NULL
);

-- The beta is invite-only: sign-up needs a code with uses left.
CREATE TABLE invite_codes (
  code        TEXT PRIMARY KEY COLLATE NOCASE,
  created_by  TEXT REFERENCES users(id),
  max_uses    INTEGER NOT NULL DEFAULT 10,
  uses        INTEGER NOT NULL DEFAULT 0,
  expires_at  INTEGER,
  created_at  INTEGER NOT NULL
);

CREATE TABLE follows (
  follower_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);

-- Snacks ------------------------------------------------------------------

-- attribute_set is a JSON array of the extra sliders this category shows,
-- on top of the universal ones.
CREATE TABLE categories (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  attribute_set  TEXT NOT NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE snacks (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  brand        TEXT,
  category_id  TEXT NOT NULL REFERENCES categories(id),
  country      TEXT NOT NULL DEFAULT 'GB',
  barcode      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
  merged_into  TEXT REFERENCES snacks(id),
  created_by   TEXT REFERENCES users(id),
  created_at   INTEGER NOT NULL
);
CREATE INDEX snacks_category ON snacks(category_id, status);
CREATE INDEX snacks_name ON snacks(name COLLATE NOCASE);

-- Check-ins ---------------------------------------------------------------

CREATE TABLE checkins (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snack_id    TEXT NOT NULL REFERENCES snacks(id),
  overall     REAL NOT NULL CHECK (overall >= 0.25 AND overall <= 5),
  review      TEXT,
  venue_text  TEXT,
  paired_with TEXT,
  kid_approval INTEGER CHECK (kid_approval BETWEEN 1 AND 5),
  created_at  INTEGER NOT NULL
);
CREATE INDEX checkins_user ON checkins(user_id, created_at);
CREATE INDEX checkins_snack ON checkins(snack_id, created_at);

-- One row per slider, so adding a new attribute needs no schema change.
CREATE TABLE checkin_attributes (
  checkin_id  TEXT NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
  attribute   TEXT NOT NULL,
  value       INTEGER NOT NULL CHECK (value BETWEEN 1 AND 5),
  PRIMARY KEY (checkin_id, attribute)
);

CREATE TABLE photos (
  id          TEXT PRIMARY KEY,
  checkin_id  TEXT NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
  r2_key      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('pending', 'visible', 'hidden')),
  created_at  INTEGER NOT NULL
);

-- Groups and scoring ------------------------------------------------------

CREATE TABLE groups (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  invite_code   TEXT NOT NULL UNIQUE,
  scoring_mode  TEXT NOT NULL DEFAULT 'points' CHECK (scoring_mode IN ('points', 'unique', 'checkins')),
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    INTEGER NOT NULL
);

CREATE TABLE group_members (
  group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX group_members_user ON group_members(user_id);

-- Every point earned is a row. Any leaderboard (this week, this group) is a
-- SUM over this table, and a suspicious total can be traced back.
CREATE TABLE points_ledger (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checkin_id  TEXT REFERENCES checkins(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  points      INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX points_user_time ON points_ledger(user_id, created_at);
CREATE INDEX points_time ON points_ledger(created_at);

CREATE TABLE badges (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  points       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE user_badges (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id   TEXT NOT NULL REFERENCES badges(id),
  earned_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, badge_id)
);

-- Moderation --------------------------------------------------------------

CREATE TABLE reports (
  id           TEXT PRIMARY KEY,
  reporter_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN ('snack', 'checkin', 'photo', 'user')),
  target_id    TEXT NOT NULL,
  reason       TEXT NOT NULL,
  resolved     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);

-- Starting categories, from the rating model in the definition doc.
INSERT INTO categories (id, name, attribute_set, sort_order) VALUES
  ('crisps',    'Crisps and chips',     '["crunch","spice","greasiness"]', 1),
  ('pub',       'Pub snacks',           '["crunch","spice","pint_pairing"]', 2),
  ('chocolate', 'Chocolate and sweets', '["richness","chewiness","melt"]', 3),
  ('biscuits',  'Biscuits',             '["crunch","dunkability"]', 4),
  ('healthy',   'Healthy snacks',       '["fill_up","healthiness"]', 5),
  ('nuts',      'Nuts and seeds',       '["crunch","spice","seasoning"]', 6),
  ('kids',      'Kids snacks',          '["mess","lunchbox"]', 7),
  ('world',     'World snacks',         '["spice","novelty"]', 8);
