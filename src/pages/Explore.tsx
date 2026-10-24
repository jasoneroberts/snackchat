import { useEffect, useState } from "react";
import { attributesFor, CATEGORIES, getCategory } from "../../shared/catalogue";
import type { ExplorePage, Preferences, SnackSummary, Suggestion } from "../../shared/types";
import { api, errorText } from "../api";
import { CompareBars, CompareKey } from "../components/CompareBars";
import { Link } from "../components/Link";
import { SnackTile } from "../components/SnackTile";
import { rating } from "../lib/format";
import { useVoice } from "../lib/voice";

// Remember the snack-type filter on this device, like Boards does.
const SAVED_FILTER = "snackchat.explore.category";
function loadFilter(): string {
  try {
    return localStorage.getItem(SAVED_FILTER) ?? "";
  } catch {
    return "";
  }
}

/**
 * Explore: pick a snack type, say what you like in that type, then get the
 * snacks whose community averages are closest to it. Each type has its own
 * taste, so you can like hot crisps and mild chocolate. Save a suggestion to
 * try later, or discard it to stop seeing it.
 */
export function Explore() {
  const { t } = useVoice();
  const [data, setData] = useState<ExplorePage | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(loadFilter);

  const load = (type = category) =>
    api<ExplorePage>(`/explore?category=${encodeURIComponent(type)}`)
      .then(setData)
      .catch((err) => setError(errorText(err)));

  useEffect(() => {
    load();
  }, []);

  const filter = (type: string) => {
    setCategory(type);
    setEditing(false);
    try {
      localStorage.setItem(SAVED_FILTER, type);
    } catch {
      // Storage blocked: the filter still works, it just won't be remembered.
    }
    load(type);
  };

  // Save or discard: take the card away straight away, then tell the server.
  const choose = async (s: Suggestion, choice: "saved" | "discarded") => {
    if (!data) return;
    setData({
      ...data,
      suggestions: data.suggestions.filter((x) => x.snack.id !== s.snack.id),
      saved: choice === "saved" ? [s.snack, ...data.saved] : data.saved,
    });
    try {
      await api(`/explore/${encodeURIComponent(s.snack.id)}`, { body: { choice } });
    } catch (err) {
      setError(errorText(err));
      load();
    }
  };

  const unsave = async (snack: SnackSummary) => {
    if (!data) return;
    setData({ ...data, saved: data.saved.filter((x) => x.id !== snack.id) });
    try {
      await api(`/explore/${encodeURIComponent(snack.id)}`, { method: "DELETE" });
      load(); // it can be suggested again
    } catch (err) {
      setError(errorText(err));
    }
  };

  if (error && !data) return <p className="error page">{error}</p>;
  if (!data) return <p className="muted page">Loading…</p>;

  const type = getCategory(category);
  const taste = type ? data.tastes[type.id] : undefined;
  const setTypes = CATEGORIES.filter((c) => data.tastes[c.id]);
  // Suggestions need a taste: for the chosen type, or for at least one type under "All".
  const canSuggest = type ? !!taste : setTypes.length > 0;

  return (
    <div className="page stack">
      <div className="chip-scroll">
        <button type="button" className={category === "" ? "pill on" : "pill"} onClick={() => filter("")}>
          All snacks
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" className={category === c.id ? "pill on" : "pill"} onClick={() => filter(c.id)}>
            {c.name}
          </button>
        ))}
      </div>

      {type ? (
        editing || !taste ? (
          <PreferenceEditor
            key={type.id}
            category={type.id}
            initial={taste ?? null}
            onCancel={taste ? () => setEditing(false) : undefined}
            onSaved={() => {
              setEditing(false);
              load();
            }}
          />
        ) : (
          <section className="card-plain">
            <div className="row-between">
              <h2 className="section-title">
                {t("explore.yourTaste")} in {type.short}
              </h2>
              <button type="button" className="link-button" onClick={() => setEditing(true)}>
                Edit
              </button>
            </div>
            <div className="pref-summary small">
              {attributesFor(type.id).map((a) => (
                <span key={a.key} className="chip">
                  {a.label} {taste[a.key] ?? "any"}
                </span>
              ))}
            </div>
          </section>
        )
      ) : (
        <section className="card-plain stack-sm">
          <h2 className="section-title">{t("explore.yourTaste")}</h2>
          {setTypes.length ? (
            <>
              <p className="small muted no-margin">
                Each type has its own taste. Suggestions below use your taste for each snack's type. Tap a type to
                change it.
              </p>
              <div className="pref-summary small">
                {setTypes.map((c) => (
                  <button key={c.id} type="button" className="chip chip-button" onClick={() => filter(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="small muted no-margin">
              Pick a snack type above and say what you like in it. You can set a different taste for each type, like
              hot crunchy crisps but mild chocolate.
            </p>
          )}
        </section>
      )}

      {error && <p className="error">{error}</p>}

      {data.saved.length > 0 && !editing && (
        <section className="stack-sm">
          <h2 className="section-title">{t("explore.saved")}</h2>
          {data.saved.map((snack) => (
            <div key={snack.id} className="saved-row">
              <Link href={`/snack/${snack.id}`} className="row grow saved-link">
                <SnackTile snack={snack} size={44} />
                <span className="grow">
                  <b>{snack.name}</b>
                  <span className="small muted"> {snack.brand ?? getCategory(snack.category)?.short}</span>
                </span>
              </Link>
              <Link href={`/checkin?snack=${encodeURIComponent(snack.id)}`} className="button small">
                {t("explore.tried")}
              </Link>
              <button type="button" className="icon-button" aria-label={`Remove ${snack.name}`} onClick={() => unsave(snack)}>
                ×
              </button>
            </div>
          ))}
        </section>
      )}

      {canSuggest && !editing && (
        <>
          <div>
            <h2 className="section-title">{t("explore.suggestions")}</h2>
            <p className="small muted">Closest to your taste, from everyone's ratings. Snacks you've had are left out.</p>
          </div>
          {data.suggestions.length === 0 ? (
            <p className="muted">{type ? `No ${type.short} to suggest right now. Try another type.` : t("explore.none")}</p>
          ) : (
            <>
              <CompareKey />
              {data.suggestions.map((s) => (
                <SuggestionCard key={s.snack.id} s={s} prefs={data.tastes[s.snack.category] ?? {}} onChoose={(c) => choose(s, c)} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

function SuggestionCard({
  s,
  prefs,
  onChoose,
}: {
  s: Suggestion;
  prefs: Preferences;
  onChoose: (choice: "saved" | "discarded") => void;
}) {
  const { t } = useVoice();
  return (
    <article className="card-plain suggestion">
      <Link href={`/snack/${s.snack.id}`} className="suggestion-head">
        <SnackTile snack={s.snack} size={56} />
        <span className="grow">
          <b>{s.snack.name}</b>
          <span className="small muted">
            {s.snack.brand ? `${s.snack.brand} · ` : ""}★ {rating(Number(s.avg.toFixed(2)))} from {s.count}{" "}
            {s.count === 1 ? "check-in" : "check-ins"}
          </span>
        </span>
        <span className="match-badge">{Math.round(s.match * 100)}%</span>
      </Link>
      <CompareBars attributes={attributesFor(s.snack.category)} mine={prefs} theirs={s.averages} />
      <div className="suggestion-buttons">
        <button type="button" className="button secondary small" onClick={() => onChoose("discarded")}>
          {t("explore.discard")}
        </button>
        <button type="button" className="button small" onClick={() => onChoose("saved")}>
          {t("explore.save")}
        </button>
      </div>
    </article>
  );
}

// 0 on a slider means "don't mind": that slider is left out of matching.
function PreferenceEditor({
  category,
  initial,
  onCancel,
  onSaved,
}: {
  category: string;
  initial: Preferences | null;
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const { t } = useVoice();
  const sliders = attributesFor(category);
  const [prefs, setPrefs] = useState<Record<string, number>>(() =>
    Object.fromEntries(sliders.map((a) => [a.key, initial ? initial[a.key] ?? 0 : 3])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setCount = Object.values(prefs).filter((v) => v > 0).length;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = Object.fromEntries(sliders.map((a) => [a.key, prefs[a.key] || null]));
      await api(`/explore/taste/${encodeURIComponent(category)}`, { method: "PUT", body });
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <section className="card-plain stack-sm">
      <div>
        <h2 className="section-title">
          {t("explore.setTaste")} <span className="muted">({getCategory(category)?.short})</span>
        </h2>
        <p className="small muted">
          Slide each one to what you like in {getCategory(category)?.short}. All the way left means you don't mind.
        </p>
      </div>
      {sliders.map((a) => {
        const v = prefs[a.key];
        return (
          <div key={a.key} className="slider">
            <div className="slider-top">
              <label htmlFor={`pref-${a.key}`}>{a.label}</label>
              <b>{v ? `${v}/5` : "don't mind"}</b>
            </div>
            <input
              id={`pref-${a.key}`}
              type="range"
              min={0}
              max={5}
              step={1}
              value={v}
              onChange={(e) => setPrefs({ ...prefs, [a.key]: Number(e.target.value) })}
            />
            <div className="slider-ends">
              <span>{a.low}</span>
              <span>{a.high}</span>
            </div>
          </div>
        );
      })}
      {setCount < 2 && <p className="small muted">Set at least two to get suggestions.</p>}
      {error && <p className="error">{error}</p>}
      <div className="row">
        {onCancel && (
          <button type="button" className="button secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="button" className="button grow" disabled={busy || setCount < 2} onClick={save}>
          {busy ? "Saving…" : t("explore.findSnacks")}
        </button>
      </div>
    </section>
  );
}
