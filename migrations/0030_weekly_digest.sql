-- No longer used. These columns were for a Sunday "weekly round-up" push, which
-- was replaced the same night by the "Your week" card in the feed (worker/lib/
-- yourWeek.ts), which works things out from likes and check-ins and stores
-- nothing. They're already on the live database, so the file stays. Both
-- columns are harmless and can be dropped later.
ALTER TABLE users ADD COLUMN weekly_digest INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN digest_sent_at INTEGER;
