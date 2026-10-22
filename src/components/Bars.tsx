import type { Attribute } from "../../shared/catalogue";

/** Horizontal bars for slider averages, in the order the sliders are listed. */
export function Bars({
  attributes,
  values,
  dark = false,
}: {
  attributes: Attribute[];
  values: Record<string, number>;
  dark?: boolean;
}) {
  const rows = attributes.filter((a) => values[a.key] !== undefined);
  if (!rows.length) return null;
  return (
    <div className="bars">
      {rows.map((a) => (
        <div key={a.key} className="bar-row">
          <span className="bar-label">{a.label}</span>
          <span className="bar-track">
            <span className={dark ? "bar-fill dark" : "bar-fill"} style={{ width: `${(values[a.key] / 5) * 100}%` }} />
          </span>
          <span className="bar-value">{values[a.key].toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}
