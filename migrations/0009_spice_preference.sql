-- Spiciness joins the taste preferences. Snacks whose type has no Spice
-- slider (chocolate, sweets...) count as mild when matching.
ALTER TABLE taste_preferences ADD COLUMN spice INTEGER CHECK (spice BETWEEN 1 AND 5);
