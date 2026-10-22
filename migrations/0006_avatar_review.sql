-- A new profile picture waits here until an admin approves it; until then
-- everyone else keeps seeing avatar_id (the last approved picture).
ALTER TABLE users ADD COLUMN avatar_pending_id TEXT;
CREATE UNIQUE INDEX users_avatar_pending ON users(avatar_pending_id);
