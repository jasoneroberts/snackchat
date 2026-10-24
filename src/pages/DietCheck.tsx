import { useEffect, useState } from "react";
import { getCategory } from "../../shared/catalogue";
import type { DietRow } from "../../shared/types";
import { api, errorText } from "../api";
import { SnackTile } from "../components/SnackTile";

type Answer = boolean | null;
interface Suggestion {
  product: { name: string; brands: string; url: string } | null;
  vegan: Answer;
  glutenFree: Answer;
  why: string[];
}

/**
 * Admin page: confirm each snack's diet labels. Open Food Facts suggests an
 * answer; you check it (ideally against the pack) and confirm. Only
 * confirmed snacks show up when someone filters for Vegan or Gluten-free.
 */
export function DietCheck() {
  const [snacks, setSnacks] = useState<DietRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showChecked, setShowChecked] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = () =>
    api<{ snacks: DietRow[] }>("/admin/diet")
      .then((data) => setSnacks(data.snacks))
      .catch((err) => setError(errorText(err)));

  useEffect(() => {
    load();
  }, []);

  if (error && !snacks) return <p className="error page">{error}</p>;
  if (!snacks) return <p className="muted page">Loading…</p>;

  const todo = snacks.filter((s) => !s.checkedAt);
  const shown = showChecked ? snacks : todo;
  // Open the next unchecked snack after confirming one, so you can work down the list.
  const next = (id: string) => todo.find((s) => s.id !== id && !s.checkedAt)?.id ?? null;

  return (
    <div className="page stack">
      <p className="small muted no-margin">
        Tap a snack to see what Open Food Facts says, then confirm. Only confirmed snacks pass the Vegan and Gluten-free
        filters. {todo.length} of {snacks.length} still to check.
      </p>
      <div className="chip-scroll">
        <button type="button" className={!showChecked ? "pill on" : "pill"} onClick={() => setShowChecked(false)}>
          To check ({todo.length})
        </button>
        <button type="button" className={showChecked ? "pill on" : "pill"} onClick={() => setShowChecked(true)}>
          All snacks
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {shown.length === 0 ? (
        <p className="muted">All checked. Nice.</p>
      ) : (
        <section className="card-plain">
          {shown.map((s) => (
            <div key={s.id} className="brand-item">
              <button type="button" className="admin-snack-row" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
                <span className="brand-logo-slot">
                  <SnackTile snack={s} size={44} />
                </span>
                <span className="grow">
                  <b>{s.name}</b>
                  <span className="small muted block">
                    {s.brand ?? "No maker"} · {getCategory(s.category)?.short}
                    {s.checkedAt ? ` · ${summary(s)}` : ""}
                  </span>
                </span>
                <span className="chevron" aria-hidden="true">{open === s.id ? "▴" : "▾"}</span>
              </button>
              {open === s.id && (
                <DietEditor
                  snack={s}
                  onSaved={() => {
                    setOpen(next(s.id));
                    load();
                  }}
                />
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

const summary = (s: DietRow) =>
  [s.vegan ? "vegan" : s.vegan === false ? "not vegan" : null, s.glutenFree ? "gluten-free" : s.glutenFree === false ? "has gluten" : null]
    .filter(Boolean)
    .join(", ") || "not known";

function DietEditor({ snack, onSaved }: { snack: DietRow; onSaved: () => void }) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [vegan, setVegan] = useState<Answer>(snack.vegan);
  const [glutenFree, setGlutenFree] = useState<Answer>(snack.glutenFree);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Suggestion>(`/admin/diet/${encodeURIComponent(snack.id)}/suggestion`)
      .then((s) => {
        setSuggestion(s);
        // Not checked before? Start from the suggestion.
        if (!snack.checkedAt) {
          setVegan(s.vegan);
          setGlutenFree(s.glutenFree);
        }
      })
      .catch((err) => setLookupError(errorText(err)));
  }, [snack.id]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/diet/${encodeURIComponent(snack.id)}`, { method: "PUT", body: { vegan, glutenFree } });
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <div className="snack-editor stack-sm">
      <div className="small">
        {lookupError ? (
          <span className="error">{lookupError}</span>
        ) : !suggestion ? (
          <span className="muted">Looking it up on Open Food Facts…</span>
        ) : suggestion.product ? (
          <>
            Open Food Facts:{" "}
            <a href={suggestion.product.url} target="_blank" rel="noreferrer">
              {suggestion.product.name}
              {suggestion.product.brands ? ` (${suggestion.product.brands})` : ""}
            </a>
            <ul className="diet-why">
              {suggestion.why.length ? suggestion.why.map((w) => <li key={w}>{w}</li>) : <li>No diet info on this product.</li>}
            </ul>
            <span className="muted">Make sure it's the same product. If not, set it yourself.</span>
          </>
        ) : (
          <span className="muted">Not found on Open Food Facts. Set it from the pack.</span>
        )}
      </div>
      <Choice label="Vegan" value={vegan} onChange={setVegan} />
      <Choice label="Labelled gluten-free" value={glutenFree} onChange={setGlutenFree} />
      {error && <p className="error">{error}</p>}
      <button type="button" className="button small" disabled={busy} onClick={confirm}>
        {busy ? "Saving…" : snack.checkedAt ? "Save" : "Confirm"}
      </button>
    </div>
  );
}

function Choice({ label, value, onChange }: { label: string; value: Answer; onChange: (v: Answer) => void }) {
  const options: [Answer, string][] = [
    [true, "Yes"],
    [false, "No"],
    [null, "Don't know"],
  ];
  return (
    <div className="diet-choice">
      <span className="field-label">{label}</span>
      <div className="segmented small">
        {options.map(([v, text]) => (
          <button key={text} type="button" className={value === v ? "on" : ""} aria-pressed={value === v} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
