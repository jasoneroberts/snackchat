import { useState } from "react";
import { type Diet, DIET_NOTE, DIETS } from "../../shared/diet";

// The diet filter is shared by Explore and Boards, and remembered on this device.
const SAVED = "snackchat.diet";

function load(): Diet[] {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED) ?? "[]");
    return Array.isArray(saved) ? saved.filter((d) => DIETS.some((x) => x.id === d)) : [];
  } catch {
    return [];
  }
}

/** The chosen diets, and a setter that remembers them. */
export function useDiets(): [Diet[], (next: Diet[]) => void] {
  const [diets, setDiets] = useState(load);
  const update = (next: Diet[]) => {
    setDiets(next);
    try {
      localStorage.setItem(SAVED, JSON.stringify(next));
    } catch {
      // Storage blocked: the filter still works, it just won't be remembered.
    }
  };
  return [diets, update];
}

/** "&diet=vegan,gf" for an API call, or "" with no filter. */
export const dietQuery = (diets: Diet[]) => (diets.length ? `&diet=${diets.join(",")}` : "");

/** Toggle pills for Vegan and Labelled gluten-free, with the check-the-pack note when one is on. */
export function DietFilter({ diets, onChange }: { diets: Diet[]; onChange: (next: Diet[]) => void }) {
  return (
    <div className="stack-xs">
      <div className="row wrap">
        {DIETS.map((d) => {
          const on = diets.includes(d.id);
          return (
            <button
              key={d.id}
              type="button"
              className={on ? "pill small on" : "pill small"}
              aria-pressed={on}
              onClick={() => onChange(on ? diets.filter((x) => x !== d.id) : [...diets, d.id])}
            >
              {on ? "✓ " : ""}
              {d.label}
            </button>
          );
        })}
      </div>
      {diets.length > 0 && <p className="small muted no-margin">Only snacks we've checked. {DIET_NOTE}</p>}
    </div>
  );
}

/** Badges for a snack's confirmed labels; nothing when neither is confirmed. */
export function DietBadges({ vegan, glutenFree }: { vegan: boolean | null; glutenFree: boolean | null }) {
  if (!vegan && !glutenFree) return null;
  return (
    <div className="stack-xs">
      <div className="row wrap">
        {vegan && <span className="diet-badge">Vegan</span>}
        {glutenFree && <span className="diet-badge">Labelled gluten-free</span>}
      </div>
      <p className="small muted no-margin">{DIET_NOTE}</p>
    </div>
  );
}
