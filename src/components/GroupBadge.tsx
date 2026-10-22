import { avatarColour, initials } from "../lib/format";

/** A rounded square with the group's initials, coloured by its name. */
export function GroupBadge({ name, size = 48 }: { name: string; size?: number }) {
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
