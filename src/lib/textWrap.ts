// Line wrapping for text drawn on a canvas (the share picture). Kept apart
// from shareCard.ts so tests can run it without a browser.

/** Anything that can measure text: a canvas context, or a stand-in in tests. */
export interface Measurer {
  measureText(text: string): { width: number };
}

/** Splits text into at most `max` lines that fit `width`, ending with "…" if it had to cut. */
export function wrap(ctx: Measurer, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const tryLine = current ? `${current} ${w}` : w;
    if (ctx.measureText(tryLine).width <= width || !current) current = tryLine;
    else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= max) return lines.map((l) => shorten(ctx, l, width));
  const kept = lines.slice(0, max);
  kept[max - 1] = shorten(ctx, `${kept[max - 1]}…`, width, true);
  return kept;
}

/** Trims a line that's still too wide (one very long word) and adds "…". */
function shorten(ctx: Measurer, line: string, width: number, ellipsis = false): string {
  if (ctx.measureText(line).width <= width) return line;
  let s = ellipsis ? line.slice(0, -1) : line;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}
