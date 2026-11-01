import { avatarColour, initials } from "../lib/format";

/**
 * A person's profile picture, or their initials on a colour when they haven't set one.
 * `crown` tips a small wonky gold crown on its top corner (a champion last week);
 * `crownLabel` says what they won, for screen readers and a long press.
 */
export function Avatar({
  username,
  avatarId,
  size = 38,
  crown = false,
  crownLabel = "Last week's champion",
}: {
  username: string;
  avatarId?: string | null;
  size?: number;
  crown?: boolean;
  crownLabel?: string;
}) {
  const face = <Face username={username} avatarId={avatarId} size={size} />;
  if (!crown) return face;
  return (
    <span className="crowned" title={crownLabel}>
      {face}
      <Crown size={Math.max(13, Math.round(size * 0.42))} label={crownLabel} />
    </span>
  );
}

/**
 * A small, slightly wonky gold crown: uneven points, a lopsided band and a
 * tilt (from CSS), so it looks hand-drawn and a bit cheeky rather than
 * regal. Drawn rather than an emoji so it looks the same on every phone.
 */
export function Crown({ size = 16, label = "Last week's champion" }: { size?: number; label?: string }) {
  const gold = "#f6c343";
  const edge = "#9a6a06";
  return (
    <svg className="crown" width={size} height={size} viewBox="0 0 24 24" aria-label={label} role="img">
      <path
        d="M2.8 9.6 L7.6 12.9 L10.9 4.6 L15.4 11.6 L21.4 7.3 L19.6 18.4 Q12.4 20.1 4.6 18.9 Z"
        fill={gold}
        stroke={edge}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M5 16.4 Q12 17.6 19.7 15.9" fill="none" stroke={edge} strokeWidth="1" strokeLinecap="round" opacity="0.7" />
      <circle cx="2.8" cy="9.4" r="1.5" fill={gold} stroke={edge} strokeWidth="1.1" />
      <circle cx="10.9" cy="4.3" r="1.8" fill={gold} stroke={edge} strokeWidth="1.1" />
      <circle cx="21.4" cy="7" r="1.3" fill={gold} stroke={edge} strokeWidth="1.1" />
    </svg>
  );
}

/** A crown beside a snack's name when it topped the Table last week or month; nothing otherwise. */
export function SnackCrown({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <span className="snack-crown" title={label}>
      <Crown size={15} label={label} />
    </span>
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
