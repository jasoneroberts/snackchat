-- Taste preferences and Explore.
--
-- A person's taste profile is what they say they like, set on the Explore
-- page: one 1-5 value per universal slider (flavour, salt, sweet, value,
-- more). NULL means "don't mind", so that slider is left out of matching.
CREATE TABLE taste_preferences (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  flavour     INTEGER CHECK (flavour BETWEEN 1 AND 5),
  salt        INTEGER CHECK (salt BETWEEN 1 AND 5),
  sweet       INTEGER CHECK (sweet BETWEEN 1 AND 5),
  value       INTEGER CHECK (value BETWEEN 1 AND 5),
  more        INTEGER CHECK (more BETWEEN 1 AND 5),
  updated_at  INTEGER NOT NULL
);

-- What someone did with a suggestion: kept it to try later, or binned it so
-- it stops being suggested.
CREATE TABLE explore_choices (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snack_id    TEXT NOT NULL REFERENCES snacks(id) ON DELETE CASCADE,
  choice      TEXT NOT NULL CHECK (choice IN ('saved', 'discarded')),
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, snack_id)
);
