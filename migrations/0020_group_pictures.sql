-- A squad's own picture, set by its owner. The file is in R2 at
-- groups/<group id>/<picture id>; NULL means show the initials.
ALTER TABLE groups ADD COLUMN picture_id TEXT;
