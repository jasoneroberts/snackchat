-- Check-ins that stay on show (feed, profile) but don't count: not in snack
-- ratings, boards or points totals. Used for Jase's check-ins from before
-- launch (2026-10-30 16:00 UK), set by hand. 1 = counts, as normal.
ALTER TABLE checkins ADD COLUMN scored INTEGER NOT NULL DEFAULT 1;
