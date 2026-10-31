-- Friend invites: who brought whom. One row per person who joined from
-- someone's personal invite link (?by=<username>). The points themselves go
-- in points_ledger as 'invite_join' and 'invite_checkin' rows with no
-- check-in, so they add to the inviter's total but never to a board.
CREATE TABLE referrals (
  friend_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  inviter_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at         INTEGER NOT NULL,
  join_points       INTEGER NOT NULL DEFAULT 0, -- 0 when the inviter was over the day's cap
  first_checkin_id  TEXT,                        -- set once, by the friend's first check-in
  checked_in_at     INTEGER,
  checkin_points    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX referrals_inviter ON referrals (inviter_id, joined_at);
