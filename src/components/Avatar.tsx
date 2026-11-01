import { avatarColour, initials } from "../lib/format";
import { snackAwardLabel } from "../lib/crowns";

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
// Two awards, two crowns: gold for a week's winner, purple with gold
// jewels for a month's, so a snack holding one is easy to tell from the other.
const CROWN_COLOURS = {
  week: { fill: "#f6c343", edge: "#9a6a06", jewel: "#f6c343" },
  month: { fill: "#8e5bd6", edge: "#4b2a86", jewel: "#f6c343" },
};

export function Crown({
  size = 16,
  label = "Last week's champion",
  kind = "week",
}: {
  size?: number;
  label?: string;
  kind?: "week" | "month";
}) {
  const { fill: gold, edge, jewel } = CROWN_COLOURS[kind];
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
      <circle cx="2.8" cy="9.4" r="1.5" fill={jewel} stroke={edge} strokeWidth="1.1" />
      <circle cx="10.9" cy="4.3" r="1.8" fill={jewel} stroke={edge} strokeWidth="1.1" />
      <circle cx="21.4" cy="7" r="1.3" fill={jewel} stroke={edge} strokeWidth="1.1" />
    </svg>
  );
}

/**
 * Crowns tipped on the corner of a snack's picture: gold (top right) for
 * last week's top snack, purple (top left) for last month's. Put it inside
 * a positioned box around the picture; it draws nothing for other snacks.
 */
export function SnackCrowns({ won, size = 18 }: { won: ("week" | "month")[] | undefined; size?: number }) {
  if (!won?.length) return null;
  return (
    <>
      {won.map((kind) => (
        <span key={kind} className={`snack-crown ${kind}`} title={snackAwardLabel(kind)}>
          <Crown size={size} kind={kind} label={snackAwardLabel(kind)} />
        </span>
      ))}
    </>
  );
}

/** For a snack with no picture to sit them on: its award crowns, small, after its name. */
export function InlineSnackCrowns({ won }: { won: ("week" | "month")[] | undefined }) {
  if (!won?.length) return null;
  return (
    <>
      {won.map((kind) => (
        <span key={kind} className="inline-crown" title={snackAwardLabel(kind)}>
          <Crown size={15} kind={kind} label={snackAwardLabel(kind)} />
        </span>
      ))}
    </>
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
