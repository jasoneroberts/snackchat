-- Maker logos, uploaded by an admin. A snack with no community photo shows
-- its brand's logo instead (or nothing, if there isn't one).
-- brand_key is the brand name trimmed and lower-cased, so "Walkers" and
-- "walkers " share a logo. Each upload gets a new logo_id, which is also the
-- R2 key's last part, so browsers can cache a logo for good.
CREATE TABLE brand_logos (
  brand_key   TEXT PRIMARY KEY,
  logo_id     TEXT NOT NULL UNIQUE,
  updated_at  INTEGER NOT NULL
);
