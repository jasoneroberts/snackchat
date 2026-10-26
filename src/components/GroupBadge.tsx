import { avatarColour, initials } from "../lib/format";

/**
 * A group's picture as a rounded square, or, until its owner adds one, its
 * initials on a colour picked from its name.
 */
export function GroupBadge({ name, pictureId, size = 48 }: { name: string; pictureId?: string | null; size?: number }) {
  if (pictureId) {
    return (
      <img
        className="group-badge"
        src={`/api/groups/picture/${encodeURIComponent(pictureId)}`}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "cover" }}
      />
    );
  }
  const letters = initials(name.replace(/[^A-Za-z0-9 ]/g, "").replace(/\s+/g, "_"));
  return (
    <span
      className="group-badge"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.34, background: avatarColour(name) }}
    >
      {letters}
    </span>
  );
}
