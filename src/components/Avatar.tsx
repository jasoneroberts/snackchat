import { avatarColour, initials } from "../lib/format";

export function Avatar({ username, size = 38 }: { username: string; size?: number }) {
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
