-- Taste preferences per snack type: someone can like hot, crunchy crisps and
-- mild, melty chocolate. One row per person, type and slider; a slider with
-- no row means "don't mind". Only the sliders that type is rated on are used.
CREATE TABLE taste_by_type (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id  TEXT NOT NULL,
  attribute    TEXT NOT NULL,
  value        INTEGER NOT NULL CHECK (value BETWEEN 1 AND 5),
  PRIMARY KEY (user_id, category_id, attribute)
);

-- Start everyone off with their old single taste, copied to every type that
-- is rated on each slider. They can then change each type separately.
-- (taste_preferences is no longer read after this.)
INSERT INTO taste_by_type SELECT t.user_id, c.value, 'flavour', t.flavour
  FROM taste_preferences t, json_each('["crisps","nuts","chocolate","chews","biscuits","pub","kids","world","healthy"]') c WHERE t.flavour IS NOT NULL;
INSERT INTO taste_by_type SELECT t.user_id, c.value, 'salt', t.salt
  FROM taste_preferences t, json_each('["crisps","nuts","chocolate","chews","biscuits","pub","kids","world","healthy"]') c WHERE t.salt IS NOT NULL;
INSERT INTO taste_by_type SELECT t.user_id, c.value, 'sweet', t.sweet
  FROM taste_preferences t, json_each('["crisps","nuts","chocolate","chews","biscuits","pub","kids","world","healthy"]') c WHERE t.sweet IS NOT NULL;
INSERT INTO taste_by_type SELECT t.user_id, c.value, 'value', t.value
  FROM taste_preferences t, json_each('["crisps","nuts","chocolate","chews","biscuits","pub","kids","world","healthy"]') c WHERE t.value IS NOT NULL;
INSERT INTO taste_by_type SELECT t.user_id, c.value, 'more', t.more
  FROM taste_preferences t, json_each('["crisps","nuts","chocolate","chews","biscuits","pub","kids","world","healthy"]') c WHERE t.more IS NOT NULL;
INSERT INTO taste_by_type SELECT t.user_id, c.value, 'crunch', t.crunch
  FROM taste_preferences t, json_each('["crisps","nuts","biscuits","pub"]') c WHERE t.crunch IS NOT NULL;
INSERT INTO taste_by_type SELECT t.user_id, c.value, 'spice', t.spice
  FROM taste_preferences t, json_each('["crisps","nuts","pub","world"]') c WHERE t.spice IS NOT NULL;
