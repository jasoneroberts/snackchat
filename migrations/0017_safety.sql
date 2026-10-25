-- Keeping people safe: blocking, and reports that admins can deal with.

-- Someone you've blocked can't see your check-ins and you can't see theirs.
CREATE TABLE blocks (
  blocker_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX blocks_blocked ON blocks (blocked_id);

-- The reports table has been here since 0001; now it's used. reason is a
-- key from shared/reports.ts, note is what the reporter typed.
ALTER TABLE reports ADD COLUMN note TEXT;
ALTER TABLE reports ADD COLUMN resolved_at INTEGER;
ALTER TABLE reports ADD COLUMN outcome TEXT;
CREATE INDEX reports_open ON reports (resolved, created_at);
CREATE INDEX reports_target ON reports (target_type, target_id);
