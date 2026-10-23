import type { Attribute } from "../../shared/catalogue";

/**
 * Your preference and a snack's average side by side, one pair of bars per
 * slider: yours in orange on top, everyone's average for the snack in dark
 * underneath. Sliders missing from either side are left out.
 */
export function CompareBars({
  attributes,
  mine,
  theirs,
}: {
  attributes: Attribute[];
  mine: Record<string, number | undefined>;
  theirs: Record<string, number>;
}) {
  const rows = attributes.filter((a) => mine[a.key] != null && theirs[a.key] != null);
  if (!rows.length) return null;
  return (
    <div className="bars compare">
      {rows.map((a) => (
        <div key={a.key} className="bar-row">
          <span className="bar-label">{a.label}</span>
          <span className="compare-pair">
            <span className="bar-track" title={`You: ${mine[a.key]}`}>
              <span className="bar-fill" style={{ width: `${(mine[a.key]! / 5) * 100}%` }} />
            </span>
            <span className="bar-track" title={`Snack average: ${theirs[a.key].toFixed(1)}`}>
              <span className="bar-fill dark" style={{ width: `${(theirs[a.key] / 5) * 100}%` }} />
            </span>
          </span>
          <span className="compare-values">
            <span>{mine[a.key]}</span>
            <span>{theirs[a.key].toFixed(1)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** The key for CompareBars: which colour is you and which is the snack. */
export function CompareKey() {
  return (
    <div className="compare-key small muted">
      <span><i className="swatch" /> You</span>
      <span><i className="swatch dark" /> Snack average</span>
    </div>
  );
}
