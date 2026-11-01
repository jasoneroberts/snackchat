-- "Weekly round-up instead": one Sunday push that sums up the week's likes and
-- squad check-ins, in place of a push for each one as it happens.
-- weekly_digest: off for everyone (0) unless they turn it on in Settings, so
--   nobody's notifications change without them asking.
-- digest_sent_at: when we last sent them a round-up. The next one covers the
--   time since then (at most a week), and it stops a round-up going twice.
ALTER TABLE users ADD COLUMN weekly_digest INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN digest_sent_at INTEGER;
