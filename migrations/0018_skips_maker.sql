-- "Skips" is a KP snack, not a maker. Name it like the other KP snacks
-- ("Hula Hoops Original", "Nik Naks ..."), so the maker list only has makers.
UPDATE snacks SET name = 'Skips Prawn Cocktail', brand = 'KP'
 WHERE id = 'seed-skips-prawn-cocktail' AND brand = 'Skips';
