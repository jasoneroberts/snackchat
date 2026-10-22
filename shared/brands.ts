// Colours for brand tiles: a snack with no photo yet shows its brand name on
// the brand's colours. These are plain colours and text, not the brands'
// logos, which are trademarks.

interface BrandStyle {
  bg: string;
  fg: string;
}

const BRANDS: Record<string, BrandStyle> = {
  walkers: { bg: "#E4002B", fg: "#FFFFFF" },
  doritos: { bg: "#E31837", fg: "#FFD100" },
  pringles: { bg: "#C8102E", fg: "#FFFFFF" },
  "mccoy's": { bg: "#1A1A1A", fg: "#F2B705" },
  kettle: { bg: "#2E2A25", fg: "#F4E9D8" },
  tyrrells: { bg: "#F3EFE6", fg: "#3B2A1A" },
  pipers: { bg: "#1F3A5F", fg: "#FFFFFF" },
  seabrook: { bg: "#0057A8", fg: "#FFFFFF" },
  "golden wonder": { bg: "#F2C200", fg: "#7A0019" },
  burts: { bg: "#111111", fg: "#E8C66A" },
  skips: { bg: "#E6007E", fg: "#FFFFFF" },
  kp: { bg: "#E2231A", fg: "#FFFFFF" },
  smiths: { bg: "#004B8D", fg: "#FFD200" },
  popchips: { bg: "#FFFFFF", fg: "#E4002B" },
  tayto: { bg: "#E2001A", fg: "#FFDD00" },
  cadbury: { bg: "#3C1053", fg: "#FFFFFF" },
  mars: { bg: "#000000", fg: "#E4002B" },
  haribo: { bg: "#E4002B", fg: "#FFD100" },
  "rowntree's": { bg: "#E30613", fg: "#FFFFFF" },
  "mcvitie's": { bg: "#C8102E", fg: "#FFFFFF" },
  "mr porky": { bg: "#7A1F1F", fg: "#F7D774" },
  dairylea: { bg: "#0072CE", fg: "#FFFFFF" },
  barcel: { bg: "#5B2C83", fg: "#FFD100" },
  glico: { bg: "#E60012", fg: "#FFFFFF" },
  wonderful: { bg: "#00843D", fg: "#FFFFFF" },
  whitworths: { bg: "#7AB800", fg: "#FFFFFF" },
  nakd: { bg: "#F6A800", fg: "#4A2A0A" },
  graze: { bg: "#2D2926", fg: "#FFFFFF" },
};

// Brands we don't have colours for get Snackchat's own.
const DEFAULT: BrandStyle = { bg: "#2B1D0E", fg: "#FFF4E0" };

export function brandStyle(brand: string): BrandStyle {
  return BRANDS[brand.trim().toLowerCase()] ?? DEFAULT;
}
