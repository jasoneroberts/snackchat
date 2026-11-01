-- Wrong-PIN counts for quick sign-in (worker/lib/pinLock.ts). These used to
-- live in KV, which can miss counts when many tries arrive at once. D1 adds
-- one in a single step and every location sees the same number.
-- One row per name that has had a wrong PIN; a right PIN removes it.
CREATE TABLE pin_failures (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  wrong        INTEGER NOT NULL,           -- wrong PINs since the last lock
  strikes      INTEGER NOT NULL DEFAULT 0, -- locks so far; sets how long the next one lasts
  locked_until INTEGER NOT NULL DEFAULT 0, -- unix seconds; no sign-in with a PIN before this
  updated_at   INTEGER NOT NULL            -- the latest wrong PIN
);
