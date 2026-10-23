import { useLogo } from "../lib/logos";

/**
 * A snack's picture: its newest community photo, otherwise its maker's logo
 * (uploaded by an admin in Settings), otherwise nothing at all, so lists and
 * cards just close up around the name.
 */
export function SnackTile({
  snack,
  size,
  className = "",
}: {
  snack: { brand?: string | null; photoId?: string | null };
  size?: number; // square size in px; leave out to fill the parent's width
  className?: string;
}) {
  const logoId = useLogo(snack.photoId ? null : snack.brand);
  if (!snack.photoId && !logoId) return null;
  const style = size ? { width: size, height: size } : undefined;
  const classes = `snack-tile ${size ? "" : "wide"} ${snack.photoId ? "" : "logo"} ${className}`;
  const src = snack.photoId ? `/api/photos/${snack.photoId}` : `/api/logos/${logoId}`;
  return <img className={classes} style={style} src={src} alt="" loading="lazy" />;
}
