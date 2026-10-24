-- Diet labels, confirmed by an admin on the Diet check page (suggested from
-- Open Food Facts). NULL = not checked or not known, 1 = yes, 0 = no.
-- gluten_free means the pack is labelled gluten-free, a legal claim in the UK.
ALTER TABLE snacks ADD COLUMN vegan INTEGER CHECK (vegan IN (0, 1));
ALTER TABLE snacks ADD COLUMN gluten_free INTEGER CHECK (gluten_free IN (0, 1));
ALTER TABLE snacks ADD COLUMN diet_checked_at INTEGER;
