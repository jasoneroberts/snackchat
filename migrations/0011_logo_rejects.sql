-- Suggested maker logos an admin said no to, so the next suggestion shows
-- instead and the rejected one never comes back.
CREATE TABLE brand_logo_rejects (
  brand_key   TEXT NOT NULL,
  url         TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (brand_key, url)
);
