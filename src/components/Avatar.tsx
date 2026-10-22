import { avatarColour, initials } from "../lib/format";

/** A person's profile picture, or their initials on a colour when they haven't set one. */
export function Avatar({
  username,
  avatarId,
  size = 38,
}: {
  username: string;
  avatarId?: string | null;
  size?: number;
}) {
  if (avatarId) {
    return (
      <img
        className="avatar"
        src={`/api/avatars/${avatarId}`}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.37, background: avatarColour(username) }}
    >
      {initials(username)}
    </span>
  );
}
