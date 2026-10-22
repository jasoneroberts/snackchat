import { useState, type FormEvent } from "react";
import { CATEGORIES } from "../../shared/catalogue";
import type { ResetPeriod, ScoringMode } from "../../shared/types";
import { api, errorText } from "../api";
import { MODE_CHOICES, RESET_CHOICES } from "../lib/groups";
import { navigate } from "../router";

export function NewGroup() {
  const [name, setName] = useState("");
  const [scoringMode, setScoringMode] = useState<ScoringMode>("points");
  const [resetPeriod, setResetPeriod] = useState<ResetPeriod>("weekly");
  const [categories, setCategories] = useState<string[]>([]); // empty = all snack types
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setCategories((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/groups", { body: { name, scoringMode, resetPeriod, categories } });
      // Straight to inviting people: an empty group isn't much of a league.
      navigate(`/groups/${id}/invite?new=1`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <form className="page stack-lg" onSubmit={create}>
      <label className="field">
        <span className="field-label">Group name</span>
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Friday Pub Crew" />
      </label>

      <fieldset className="field">
        <legend className="field-label">How should the leaderboard rank people?</legend>
        {MODE_CHOICES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={scoringMode === m.id ? "choice on" : "choice"}
            aria-pressed={scoringMode === m.id}
            onClick={() => setScoringMode(m.id)}
          >
            <b>{m.label}</b>
            <span className="small muted">{m.desc}</span>
          </button>
        ))}
      </fieldset>

      <fieldset className="field">
        <legend className="field-label">Reset the leaderboard</legend>
        <div className="row wrap">
          {RESET_CHOICES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={resetPeriod === r.id ? "pill on" : "pill"}
              aria-pressed={resetPeriod === r.id}
              onClick={() => setResetPeriod(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend className="field-label">Snack types that count</legend>
        <span className="small muted">
          Leave them all on for an anything-goes league, or pick one for a crisps-only showdown.
        </span>
        <div className="row wrap">
          <button
            type="button"
            className={categories.length === 0 ? "pill on" : "pill"}
            aria-pressed={categories.length === 0}
            onClick={() => setCategories([])}
          >
            All snacks
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={categories.includes(c.id) ? "pill on" : "pill"}
              aria-pressed={categories.includes(c.id)}
              onClick={() => toggle(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </fieldset>

      {error && <p className="error">{error}</p>}
      <button type="submit" className="button big" disabled={busy || name.trim().length < 2}>
        {busy ? "Creating…" : "Create group"}
      </button>
    </form>
  );
}
