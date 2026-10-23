/**
 * A snack's picture: its newest community photo. With no photo yet it shows
 * nothing at all, so lists and cards just close up around the name.
 */
export function SnackTile({
  snack,
  size,
  className = "",
}: {
  snack: { photoId?: string | null };
  size?: number; // square size in px; leave out to fill the parent's width
  className?: string;
}) {
  if (!snack.photoId) return null;
  const style = size ? { width: size, height: size } : undefined;
  return (
    <img
      className={`snack-tile ${size ? "" : "wide"} ${className}`}
      style={style}
      src={`/api/photos/${snack.photoId}`}
      alt=""
      loading="lazy"
    />
  );
}
