-- "Bag it" from someone's check-in, and the reward when you then try it.
--
-- explore_choices already holds your bagged ("saved") snacks. from_checkin_id
-- remembers whose check-in you bagged it from, so that person can be thanked.
-- It's NULL for snacks bagged from Explore's suggestions, and goes back to
-- NULL if that check-in is deleted.
ALTER TABLE explore_choices ADD COLUMN from_checkin_id TEXT REFERENCES checkins(id) ON DELETE SET NULL;
-- "How many people bagged this check-in", shown on your own check-ins.
CREATE INDEX explore_choices_from ON explore_choices (from_checkin_id);

-- One row each time someone checks in a snack for the first time after
-- bagging it from another person's check-in. The key is (person, snack), so
-- each person can earn someone a tip at most once per snack, even if they
-- delete the check-in and log it again. The points themselves go in
-- points_ledger as a 'bag_tip' row with no check-in, like invite points.
CREATE TABLE bag_tips (
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- who bagged it, then tried it
  snack_id         TEXT NOT NULL REFERENCES snacks(id) ON DELETE CASCADE,
  tipper_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- whose check-in they bagged it from
  from_checkin_id  TEXT,          -- that check-in (may since have been deleted)
  checkin_id       TEXT NOT NULL, -- the try: the bagger's first check-in of the snack
  points           INTEGER NOT NULL DEFAULT 0, -- 0 when the tipper was over the day's cap
  created_at       INTEGER NOT NULL,
  PRIMARY KEY (user_id, snack_id)
);
CREATE INDEX bag_tips_tipper ON bag_tips (tipper_id, created_at);
CREATE INDEX bag_tips_from ON bag_tips (from_checkin_id);
CREATE INDEX bag_tips_checkin ON bag_tips (checkin_id);
