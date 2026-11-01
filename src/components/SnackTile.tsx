import { useLogo } from "../lib/logos";
import { SnackCrowns } from "./Avatar";

/**
 * A snack's picture: its newest community photo, otherwise its maker's logo
 * (uploaded by an admin in Settings), otherwise nothing at all, so lists and
 * cards just close up around the name.
 */
export function SnackTile({
  snack,
  size,
  className = "",
  won,
  crownSize,
}: {
  snack: { brand?: string | null; photoId?: string | null };
  size?: number; // square size in px; leave out to fill the parent's width
  className?: string;
  /** Awards this snack holds (last week's / last month's top snack): crowns on the picture's corners. */
  won?: ("week" | "month")[];
  crownSize?: number;
}) {
  const logoId = useLogo(snack.photoId ? null : snack.brand);
  if (!snack.photoId && !logoId) return null;
  const style = size ? { width: size, height: size } : undefined;
  const classes = `snack-tile ${size ? "" : "wide"} ${snack.photoId ? "" : "logo"} ${className}`;
  const src = snack.photoId ? `/api/photos/${snack.photoId}` : `/api/logos/${logoId}`;
  const img = <img className={classes} style={style} src={src} alt="" loading="lazy" />;
  if (!won?.length) return img;
  return (
    <span className={`crown-box ${size ? "" : "wide"}`}>
      {img}
      <SnackCrowns won={won} size={crownSize} />
    </span>
  );
}

/** True when SnackTile will show a picture (a photo or the maker's logo). */
export function useHasPicture(snack: { brand?: string | null; photoId?: string | null }): boolean {
  const logoId = useLogo(snack.photoId ? null : snack.brand);
  return !!snack.photoId || !!logoId;
}
