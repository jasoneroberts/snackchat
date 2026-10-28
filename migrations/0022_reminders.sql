-- Check-in reminders: a push message when someone hasn't checked in for a
-- few days. On for everyone unless they turn it off; it only reaches people
-- who've turned notifications on. reminded_at and reminder_count stop it
-- nagging: one reminder, one follow-up a week later, then quiet until they
-- check in again.
ALTER TABLE users ADD COLUMN reminders INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN reminded_at INTEGER;
ALTER TABLE users ADD COLUMN reminder_count INTEGER NOT NULL DEFAULT 0;
