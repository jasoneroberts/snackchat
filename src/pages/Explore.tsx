import { useEffect, useState } from "react";
import { CATEGORIES, getCategory, TASTE, tasteFor } from "../../shared/catalogue";
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
 * Explore: set what you like, then get the snacks whose community averages
 * are closest to it. Save one to try later, or discard it to stop seeing it.
 */
export function Explore() {
  const { t } = useVoice();
  const [data, setData] = useState<ExplorePage | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(loadFilter);

  const load = (type = category) =>
    api<ExplorePage>(`/explore?category=${encodeURIComponent(type)}`)
      .then((page) => {
        setData(page);
        if (!page.preferences) setEditing(true);
      })
      .catch((err) => setError(errorText(err)));

  useEffect(() => {
    load();
  }, []);

  const filter = (type: string) => {
    setCategory(type);
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

  return (
    <div className="page stack">
      {editing || !data.preferences ? (
        <PreferenceEditor
          initial={data.preferences}
          onCancel={data.preferences ? () => setEditing(false) : undefined}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      ) : (
        <section className="card-plain">
          <div className="row-between">
            <h2 className="section-title">{t("explore.yourTaste")}</h2>
            <button type="button" className="link-button" onClick={() => setEditing(true)}>
              Edit
            </button>
          </div>
          <div className="pref-summary small">
            {TASTE.map((a) => (
              <span key={a.key} className="chip">
                {a.label} {data.preferences![a.key] ?? "any"}
              </span>
            ))}
          </div>
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

      {data.preferences && !editing && (
        <>
          <div>
            <h2 className="section-title">{t("explore.suggestions")}</h2>
            <p className="small muted">Closest to your taste, from everyone's ratings. Snacks you've had are left out.</p>
          </div>
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
          {data.suggestions.length === 0 ? (
            <p className="muted">
              {category ? `No ${getCategory(category)?.short ?? "snacks"} to suggest right now. Try another type.` : t("explore.none")}
            </p>
          ) : (
            <>
              <CompareKey />
              {data.suggestions.map((s) => (
                <SuggestionCard key={s.snack.id} s={s} prefs={data.preferences!} onChoose={(c) => choose(s, c)} />
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
      <CompareBars attributes={tasteFor(s.snack.category)} mine={prefs} theirs={s.averages} />
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

// For a slider only some snack types are rated on, which ones: "crisps, nuts and pub snacks".
function onlyFor(key: string): string | null {
  const types = CATEGORIES.filter((c) => c.extra.some((a) => a.key === key)).map((c) => c.short);
  if (!types.length) return null;
  return types.length === 1 ? types[0] : `${types.slice(0, -1).join(", ")} and ${types[types.length - 1]}`;
}

// 0 on a slider means "don't mind": that slider is left out of matching.
function PreferenceEditor({
  initial,
  onCancel,
  onSaved,
}: {
  initial: Preferences | null;
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const { t } = useVoice();
  const [prefs, setPrefs] = useState<Record<string, number>>(() =>
    Object.fromEntries(TASTE.map((a) => [a.key, initial ? initial[a.key] ?? 0 : 3])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setCount = Object.values(prefs).filter((v) => v > 0).length;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = Object.fromEntries(TASTE.map((a) => [a.key, prefs[a.key] || null]));
      await api("/explore/preferences", { method: "PUT", body });
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <section className="card-plain stack-sm">
      <div>
        <h2 className="section-title">{t("explore.setTaste")}</h2>
        <p className="small muted">
          Slide each one to what you like. All the way left means you don't mind. This is your taste profile, shown on
          your profile too.
        </p>
      </div>
      {TASTE.map((a) => {
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
            {onlyFor(a.key) && <div className="small muted">Only counts for {onlyFor(a.key)}.</div>}
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
