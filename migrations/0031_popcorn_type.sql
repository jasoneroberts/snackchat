-- Popcorn becomes its own snack type (Jase, 2026-11-01: users said it isn't
-- a crisp). Sliders: crunch, coating, bits in your teeth (shared/catalogue.ts).
-- sort_order 6 is the slot pub snacks left behind, right after biscuits.
INSERT INTO categories (id, name, attribute_set, sort_order)
VALUES ('popcorn', 'Popcorn', '["crunch","coating","husks"]', 6);

-- Move the popcorn snacks already logged as crisps. Popchips are popped
-- potato crisps, not popcorn, so they stay put.
UPDATE snacks SET category_id = 'popcorn'
WHERE id IN (SELECT value FROM json_each('["HHMJQoxtxOF6GLth"]'));

-- Their check-ins keep the universal and crunch scores; crisp-only sliders
-- (spice, greasiness) don't exist for popcorn, so drop them.
DELETE FROM checkin_attributes
WHERE attribute IN ('spice', 'grease')
  AND checkin_id IN (
    SELECT id FROM checkins
    WHERE snack_id IN (SELECT value FROM json_each('["HHMJQoxtxOF6GLth"]'))
  );
