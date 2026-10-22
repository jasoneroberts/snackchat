const STAR = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z";

/** One star, filled from the left by `fill` (0 to 1), so 4.25 shows a quarter star. */
function Star({ fill, size }: { fill: number; size: number }) {
  return (
    <span className="star" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path d={STAR} fill="var(--line)" />
      </svg>
      <span className="star-fill" style={{ width: `${Math.round(fill * 100)}%` }}>
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <path d={STAR} fill="var(--orange)" />
        </svg>
      </span>
    </span>
  );
}

export function Stars({ value, size = 20 }: { value: number; size?: number }) {
  return (
    <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} fill={Math.max(0, Math.min(1, value - i))} size={size} />
      ))}
    </span>
  );
}

/** Tap a star for a whole number, then nudge by quarter stars. */
export function StarPicker({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const nudge = (delta: number) => onChange(Math.min(5, Math.max(0.25, (value ?? 3) + delta)));
  return (
    <div className="star-picker">
      <div className="star-row">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className="star-button"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => onChange(n)}
          >
            <Star fill={Math.max(0, Math.min(1, (value ?? 0) - (n - 1)))} size={38} />
          </button>
        ))}
        <span className="star-value">{value ?? "–"}</span>
      </div>
      <div className="row">
        <button type="button" className="pill" onClick={() => nudge(-0.25)} disabled={value === null}>
          − ¼
        </button>
        <button type="button" className="pill" onClick={() => nudge(0.25)} disabled={value === null}>
          + ¼
        </button>
      </div>
    </div>
  );
}
