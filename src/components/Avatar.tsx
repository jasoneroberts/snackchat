import { avatarColour, initials } from "../lib/format";

/**
 * A person's profile picture, or their initials on a colour when they haven't set one.
 * `crown` tips a small gold crown on its top corner (last week's squad champion).
 */
export function Avatar({
  username,
  avatarId,
  size = 38,
  crown = false,
}: {
  username: string;
  avatarId?: string | null;
  size?: number;
  crown?: boolean;
}) {
  const face = <Face username={username} avatarId={avatarId} size={size} />;
  if (!crown) return face;
  return (
    <span className="crowned" title="Last week's champion">
      {face}
      <Crown size={Math.max(14, Math.round(size * 0.48))} />
    </span>
  );
}

/** A small gold crown, drawn rather than an emoji so it looks the same on every phone. */
export function Crown({ size = 16 }: { size?: number }) {
  return (
    <svg className="crown" width={size} height={size} viewBox="0 0 24 24" aria-label="Last week's champion" role="img">
      <path
        d="M3 8.5l4.5 3.5L12 5l4.5 7L21 8.5 19.2 18H4.8z"
        fill="#f6c343"
        stroke="#9a6a06"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="3" cy="8.5" r="1.6" fill="#f6c343" stroke="#9a6a06" strokeWidth="1.2" />
      <circle cx="12" cy="5" r="1.6" fill="#f6c343" stroke="#9a6a06" strokeWidth="1.2" />
      <circle cx="21" cy="8.5" r="1.6" fill="#f6c343" stroke="#9a6a06" strokeWidth="1.2" />
    </svg>
  );
}

function Face({ username, avatarId, size }: { username: string; avatarId?: string | null; size: number }) {
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
