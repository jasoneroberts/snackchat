// Maker logos are stored per brand. Snacks name their brand freely ("Walkers",
// "walkers "), so logos are matched on this normalised form.
export const brandKey = (brand: string) => brand.trim().toLowerCase();
