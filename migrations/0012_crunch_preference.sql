-- Crunch joins the taste preferences. Like spice, it only counts for snack
-- types rated on crunch (crisps, nuts, biscuits, pub snacks).
ALTER TABLE taste_preferences ADD COLUMN crunch INTEGER CHECK (crunch BETWEEN 1 AND 5);
