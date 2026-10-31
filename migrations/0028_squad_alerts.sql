-- "Someone in your squad just checked in" push messages.
-- squad_alerts: on for everyone unless they turn it off in Settings. Like
-- like_alerts, it only reaches people who've turned notifications on for a phone.
-- No "already told" table is needed: each check-in is only ever announced
-- once, at the moment it's posted.
ALTER TABLE users ADD COLUMN squad_alerts INTEGER NOT NULL DEFAULT 1;
