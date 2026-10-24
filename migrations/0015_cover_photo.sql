-- The photo an admin picked as a snack's main picture, from anyone's check-in.
-- If it's later hidden or its owner goes private, the newest photo shows instead.
ALTER TABLE snacks ADD COLUMN cover_photo_id TEXT;
