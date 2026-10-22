-- Split "Chocolate and sweets" into Chocolate and Sweets and chews, line the
-- slider keys up with shared/catalogue.ts, and seed a starter set of UK snacks
-- so there is something to check in on day one.

UPDATE categories SET name = 'Crisps and chips', attribute_set = '["crunch","spice","grease"]', sort_order = 1 WHERE id = 'crisps';
UPDATE categories SET name = 'Nuts and seeds',   attribute_set = '["crunch","spice"]',          sort_order = 2 WHERE id = 'nuts';
UPDATE categories SET name = 'Chocolate',        attribute_set = '["rich","melt"]',             sort_order = 3 WHERE id = 'chocolate';
UPDATE categories SET name = 'Biscuits',         attribute_set = '["crunch","dunk"]',           sort_order = 5 WHERE id = 'biscuits';
UPDATE categories SET name = 'Pub snacks',       attribute_set = '["crunch","spice","pint"]',   sort_order = 6 WHERE id = 'pub';
UPDATE categories SET name = 'Kids snacks',      attribute_set = '["kid","mess"]',              sort_order = 7 WHERE id = 'kids';
UPDATE categories SET name = 'World snacks',     attribute_set = '["spice","novelty"]',         sort_order = 8 WHERE id = 'world';
UPDATE categories SET name = 'Healthy snacks',   attribute_set = '["fill","healthy"]',          sort_order = 9 WHERE id = 'healthy';
INSERT INTO categories (id, name, attribute_set, sort_order) VALUES ('chews', 'Sweets and chews', '["chew","sour"]', 4);

-- Seeded snacks are approved from the start and have no creator.
INSERT INTO snacks (id, name, brand, category_id, status, created_at) VALUES
  ('seed-monster-munch-pickled-onion', 'Monster Munch Pickled Onion', 'Walkers',     'crisps',    'approved', unixepoch()),
  ('seed-walkers-cheese-onion',        'Cheese and Onion',            'Walkers',     'crisps',    'approved', unixepoch()),
  ('seed-hula-hoops-original',         'Hula Hoops Original',         'KP',          'crisps',    'approved', unixepoch()),
  ('seed-frazzles',                    'Frazzles',                    'Smiths',      'crisps',    'approved', unixepoch()),
  ('seed-dry-roasted-peanuts',         'Dry Roasted Peanuts',         'KP',          'nuts',      'approved', unixepoch()),
  ('seed-salted-pistachios',           'Salted Pistachios',           'Wonderful',   'nuts',      'approved', unixepoch()),
  ('seed-wasabi-peas',                 'Wasabi Peas',                 'Whitworths',  'nuts',      'approved', unixepoch()),
  ('seed-dairy-milk',                  'Dairy Milk',                  'Cadbury',     'chocolate', 'approved', unixepoch()),
  ('seed-maltesers',                   'Maltesers',                   'Mars',        'chocolate', 'approved', unixepoch()),
  ('seed-twix',                        'Twix',                        'Mars',        'chocolate', 'approved', unixepoch()),
  ('seed-starmix',                     'Starmix',                     'Haribo',      'chews',     'approved', unixepoch()),
  ('seed-fruit-pastilles',             'Fruit Pastilles',             'Rowntree''s', 'chews',     'approved', unixepoch()),
  ('seed-tangfastics',                 'Tangfastics',                 'Haribo',      'chews',     'approved', unixepoch()),
  ('seed-chocolate-hobnobs',           'Chocolate Hobnobs',           'McVitie''s',  'biscuits',  'approved', unixepoch()),
  ('seed-jaffa-cakes',                 'Jaffa Cakes',                 'McVitie''s',  'biscuits',  'approved', unixepoch()),
  ('seed-scampi-fries',                'Scampi Fries',                'Smiths',      'pub',       'approved', unixepoch()),
  ('seed-bacon-fries',                 'Bacon Fries',                 'Smiths',      'pub',       'approved', unixepoch()),
  ('seed-pork-scratchings',            'Pork Scratchings',            'Mr Porky',    'pub',       'approved', unixepoch()),
  ('seed-pom-bears-original',          'Pom-Bears Original',          'KP',          'kids',      'approved', unixepoch()),
  ('seed-dairylea-dunkers',            'Dairylea Dunkers',            'Dairylea',    'kids',      'approved', unixepoch()),
  ('seed-takis-fuego',                 'Takis Fuego',                 'Barcel',      'world',     'approved', unixepoch()),
  ('seed-pocky-chocolate',             'Pocky Chocolate',             'Glico',       'world',     'approved', unixepoch()),
  ('seed-nakd-cocoa-orange',           'Cocoa Orange bar',            'Nakd',        'healthy',   'approved', unixepoch()),
  ('seed-graze-protein-oat-bites',     'Protein Oat Bites',           'Graze',       'healthy',   'approved', unixepoch());
