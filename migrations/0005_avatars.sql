-- Profile pictures. The image lives in R2 at avatars/<user id>/<avatar_id>;
-- a new id on every upload means browsers never show a stale cached picture.
ALTER TABLE users ADD COLUMN avatar_id TEXT;
CREATE UNIQUE INDEX users_avatar ON users(avatar_id);
