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
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'crisps', 'flavour', flavour FROM taste_preferences WHERE flavour IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'crisps', 'salt', salt FROM taste_preferences WHERE salt IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'crisps', 'sweet', sweet FROM taste_preferences WHERE sweet IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'crisps', 'value', value FROM taste_preferences WHERE value IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'crisps', 'more', more FROM taste_preferences WHERE more IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'crisps', 'crunch', crunch FROM taste_preferences WHERE crunch IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'crisps', 'spice', spice FROM taste_preferences WHERE spice IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'nuts', 'flavour', flavour FROM taste_preferences WHERE flavour IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'nuts', 'salt', salt FROM taste_preferences WHERE salt IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'nuts', 'sweet', sweet FROM taste_preferences WHERE sweet IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'nuts', 'value', value FROM taste_preferences WHERE value IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'nuts', 'more', more FROM taste_preferences WHERE more IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'nuts', 'crunch', crunch FROM taste_preferences WHERE crunch IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'nuts', 'spice', spice FROM taste_preferences WHERE spice IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'chocolate', 'flavour', flavour FROM taste_preferences WHERE flavour IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'chocolate', 'salt', salt FROM taste_preferences WHERE salt IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'chocolate', 'sweet', sweet FROM taste_preferences WHERE sweet IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'chocolate', 'value', value FROM taste_preferences WHERE value IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'chocolate', 'more', more FROM taste_preferences WHERE more IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'chews', 'flavour', flavour FROM taste_preferences WHERE flavour IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'chews', 'salt', salt FROM taste_preferences WHERE salt IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'chews', 'sweet', sweet FROM taste_preferences WHERE sweet IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'chews', 'value', value FROM taste_preferences WHERE value IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'chews', 'more', more FROM taste_preferences WHERE more IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'biscuits', 'flavour', flavour FROM taste_preferences WHERE flavour IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'biscuits', 'salt', salt FROM taste_preferences WHERE salt IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'biscuits', 'sweet', sweet FROM taste_preferences WHERE sweet IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'biscuits', 'value', value FROM taste_preferences WHERE value IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'biscuits', 'more', more FROM taste_preferences WHERE more IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'biscuits', 'crunch', crunch FROM taste_preferences WHERE crunch IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'pub', 'flavour', flavour FROM taste_preferences WHERE flavour IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'pub', 'salt', salt FROM taste_preferences WHERE salt IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'pub', 'sweet', sweet FROM taste_preferences WHERE sweet IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'pub', 'value', value FROM taste_preferences WHERE value IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'pub', 'more', more FROM taste_preferences WHERE more IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'pub', 'crunch', crunch FROM taste_preferences WHERE crunch IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'pub', 'spice', spice FROM taste_preferences WHERE spice IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'kids', 'flavour', flavour FROM taste_preferences WHERE flavour IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'kids', 'salt', salt FROM taste_preferences WHERE salt IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'kids', 'sweet', sweet FROM taste_preferences WHERE sweet IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'kids', 'value', value FROM taste_preferences WHERE value IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'kids', 'more', more FROM taste_preferences WHERE more IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'world', 'flavour', flavour FROM taste_preferences WHERE flavour IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'world', 'salt', salt FROM taste_preferences WHERE salt IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'world', 'sweet', sweet FROM taste_preferences WHERE sweet IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'world', 'value', value FROM taste_preferences WHERE value IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'world', 'more', more FROM taste_preferences WHERE more IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'world', 'spice', spice FROM taste_preferences WHERE spice IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'healthy', 'flavour', flavour FROM taste_preferences WHERE flavour IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'healthy', 'salt', salt FROM taste_preferences WHERE salt IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'healthy', 'sweet', sweet FROM taste_preferences WHERE sweet IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'healthy', 'value', value FROM taste_preferences WHERE value IS NOT NULL;
INSERT INTO taste_by_type (user_id, category_id, attribute, value) SELECT user_id, 'healthy', 'more', more FROM taste_preferences WHERE more IS NOT NULL;
