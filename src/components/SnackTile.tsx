import { brandStyle } from "../../shared/brands";
import { getCategory } from "../../shared/catalogue";

/**
 * A snack's picture: its newest community photo if there is one, otherwise a
 * tile with the brand name on the brand's colours, otherwise its type's colour.
 */
export function SnackTile({
  snack,
  size,
  className = "",
}: {
  snack: { name: string; brand: string | null; category: string; photoId?: string | null };
  size?: number; // square size in px; leave out to fill the parent's width
  className?: string;
}) {
  const style = size ? { width: size, height: size } : undefined;
  const classes = `snack-tile ${size ? "" : "wide"} ${className}`;

  if (snack.photoId) {
    return <img className={classes} style={style} src={`/api/photos/${snack.photoId}`} alt="" loading="lazy" />;
  }
  if (snack.brand) {
    const { bg, fg } = brandStyle(snack.brand);
    return (
      <span
        className={classes}
        aria-hidden="true"
        style={{ ...style, background: bg, color: fg, fontSize: size ? Math.max(9, size / 5.5) : undefined }}
      >
        {snack.brand}
      </span>
    );
  }
  return <span className={classes} aria-hidden="true" style={{ ...style, background: getCategory(snack.category)?.tint }} />;
}
