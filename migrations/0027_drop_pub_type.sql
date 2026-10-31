-- Drop the "Pub snacks" type (Jase, 2026-10-31): nobody had logged one and
-- crisps covers them. The three seed pub snacks (Scampi Fries, Bacon Fries,
-- Pork Scratchings) become crisps; they had no check-ins, so no ratings move.
UPDATE snacks SET category_id = 'crisps' WHERE category_id = 'pub';

-- Taste sliders people set for pub snacks have nowhere to show any more.
DELETE FROM taste_by_type WHERE category_id = 'pub';

-- Squads that only count some types: swap pub for crisps (none do today,
-- but keep it safe). Drops pub, adds crisps if it isn't already there.
UPDATE groups
SET categories = CASE
  WHEN EXISTS (SELECT 1 FROM json_each(groups.categories) WHERE value = 'crisps')
    THEN (SELECT json_group_array(value) FROM json_each(groups.categories) WHERE value != 'pub')
  ELSE (SELECT json_group_array(CASE WHEN value = 'pub' THEN 'crisps' ELSE value END) FROM json_each(groups.categories))
END
WHERE categories IS NOT NULL
  AND EXISTS (SELECT 1 FROM json_each(groups.categories) WHERE value = 'pub');

DELETE FROM categories WHERE id = 'pub';
