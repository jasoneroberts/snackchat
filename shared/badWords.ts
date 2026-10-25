// A small filter for names, reviews and snack names. It blocks slurs and the
// strongest swearing. Mild words (shit, crap, arse, bollocks, bloody) are
// allowed: this is a snack app with a lad mode, not a library.
//
// Edit the lists to change what's blocked. Anything the filter misses can
// still be reported, and admins deal with it in Settings > Reports.

// Blocked anywhere, even inside other words, as they never turn up innocently
// ("fuckingtasty", "x_nigger_x").
const ANYWHERE = ["fuck", "fuk", "fck", "nigger", "nigga", "faggot", "motherf", "wanker", "cunt"];

// Blocked as whole words only (plus -s, -es, -y, -ing, -ed), so "Scunthorpe",
// "cocktail", "Dickens" and "spice" are fine.
const WHOLE_WORDS = [
  "twat", "whore", "slut", "slag", "bitch", "bellend", "knobhead", "dickhead", "cock", "pussy",
  "retard", "spastic", "spaz", "paki", "tranny", "dyke", "chink", "kike", "coon", "gook", "wog",
  "rape", "rapist", "nazi", "porn", "dildo", "jizz", "spunk", "nonce", "paedo", "pedo",
];
// Words in ANYWHERE that also turn up inside innocent words. "cunt" is inside
// "Scunthorpe", so it's checked as a whole word too, not a substring.
const NOT_SUBSTRING = new Set(["cunt"]);

const LEET: Record<string, string> = { "0": "o", "1": "i", "!": "i", "3": "e", "4": "a", "@": "a", "5": "s", $: "s", "7": "t", "8": "b" };

/** Lower case, accents off, look-alike numbers and symbols turned into letters. */
export function normalise(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[0134578!@$]/g, (ch) => LEET[ch] ?? ch);
}

const SUFFIX = "(?:s|es|y|ing|ed|er|ers)?";
const wholeWordRe = new RegExp(`(?:^|[^a-z])(?:${[...WHOLE_WORDS, ...NOT_SUBSTRING].join("|")})${SUFFIX}(?=$|[^a-z])`);
const anywhereList = ANYWHERE.filter((w) => !NOT_SUBSTRING.has(w));

/** True when the text has a blocked word in it. */
export function hasBadWord(text: string | null | undefined): boolean {
  if (!text) return false;
  const n = normalise(text);
  // "f.u.c.k" and "f u c k": also check with the gaps between single letters taken out.
  const squashed = n.replace(/\b([a-z])[\s._*-]+(?=[a-z]\b)/g, "$1");
  return [n, squashed].some((s) => anywhereList.some((w) => s.includes(w)) || wholeWordRe.test(s));
}

export const FRIENDLY = "Let's keep it friendly.";

/** The error to show for a field with a blocked word, or null if it's fine. */
export function badWordError(fields: Record<string, string | null | undefined>): string | null {
  for (const [label, value] of Object.entries(fields)) {
    if (hasBadWord(value)) return `${FRIENDLY} Please change the ${label}.`;
  }
  return null;
}
