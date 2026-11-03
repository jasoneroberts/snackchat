-- Crackers replace World snacks and Kids snacks (Jase, 2026-11-03: user
-- feedback, and Christmas cheeseboards are coming). Sliders: crunch, holds a
-- topping, crumb factor (shared/catalogue.ts). sort_order 7 is the slot Kids
-- snacks leaves, right after popcorn; Healthy moves up to 8.
INSERT INTO categories (id, name, attribute_set, sort_order)
VALUES ('crackers', 'Crackers', '["crunch","topping","crumbs"]', 7);
UPDATE categories SET sort_order = 8 WHERE id = 'healthy';

-- The four snacks in the old types are seeds nobody has checked in on.
-- Pom-Bears are potato snacks, Pocky is a biscuit stick, Dunkers are
-- breadsticks with cheese dip, so they go with the crackers.
UPDATE snacks SET category_id = 'crisps'   WHERE id IN ('seed-pom-bears-original', 'seed-pom-bears-salt-vinegar');
UPDATE snacks SET category_id = 'biscuits' WHERE id = 'seed-pocky-chocolate';
UPDATE snacks SET category_id = 'crackers' WHERE id = 'seed-dairylea-dunkers';
-- Catch-all, in case someone adds one before this runs.
UPDATE snacks SET category_id = 'crackers' WHERE category_id IN ('kids', 'world');

-- Cracker-type snacks people logged as crisps: Jacob's Cheddars, Ritz Breaks
-- and Jacob's Bites (Frank's RedHot). One check-in each. Their crunch and
-- universal scores stay; crisp-only sliders (spice, greasiness) don't exist
-- for crackers, so drop them, as popcorn did in 0031.
UPDATE snacks SET category_id = 'crackers'
WHERE id IN (SELECT value FROM json_each('["F4e7VAXakH6siPj6","Qzjed6SyrADUokvq","yYgqb_Kye9wP-d6s"]'));
DELETE FROM checkin_attributes
WHERE attribute IN ('spice', 'grease')
  AND checkin_id IN (
    SELECT id FROM checkins
    WHERE snack_id IN (SELECT value FROM json_each('["F4e7VAXakH6siPj6","Qzjed6SyrADUokvq","yYgqb_Kye9wP-d6s"]'))
  );

-- A Christmas starter shelf, so there's something to check in on.
INSERT OR IGNORE INTO snacks (id, name, brand, category_id, status, created_at) VALUES
  ('seed-jacobs-cream-crackers',     'Cream Crackers',                'Jacob''s',     'crackers', 'approved', unixepoch()),
  ('seed-jacobs-biscuits-for-cheese','Biscuits for Cheese',           'Jacob''s',     'crackers', 'approved', unixepoch()),
  ('seed-ritz-original',             'Ritz Original',                 'Ritz',         'crackers', 'approved', unixepoch()),
  ('seed-tuc-original',              'TUC Original',                  'TUC',          'crackers', 'approved', unixepoch()),
  ('seed-carrs-table-water',         'Table Water Crackers',          'Carr''s',      'crackers', 'approved', unixepoch()),
  ('seed-nairns-rough-oatcakes',     'Rough Oatcakes',                'Nairn''s',     'crackers', 'approved', unixepoch()),
  ('seed-peters-yard-sourdough',     'Original Sourdough Crispbread', 'Peter''s Yard','crackers', 'approved', unixepoch());

-- Taste sliders people set for the old types have nowhere to show any more.
DELETE FROM taste_by_type WHERE category_id IN ('kids', 'world');

-- Squads that only count some types: drop the old ones (none do today, but
-- keep it safe). A list left empty means every type again.
UPDATE groups
SET categories = (SELECT CASE WHEN COUNT(*) = 0 THEN NULL ELSE json_group_array(value) END
                  FROM json_each(groups.categories) WHERE value NOT IN ('kids', 'world'))
WHERE categories IS NOT NULL
  AND EXISTS (SELECT 1 FROM json_each(groups.categories) WHERE value IN ('kids', 'world'));

DELETE FROM categories WHERE id IN ('kids', 'world');
