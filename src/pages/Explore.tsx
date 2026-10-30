import { useEffect, useState } from "react";
import { attributesFor, getCategory } from "../../shared/catalogue";
import { filterFor, filterShort, filterTypes, TYPE_ORDER, typeFilters } from "../../shared/typeFilters";
import type { ExplorePage, Preferences, SnackSummary, Suggestion } from "../../shared/types";
import { api, errorText } from "../api";
import { CompareBars, CompareKey } from "../components/CompareBars";
import { dietQuery, DietFilter, useDiets } from "../components/DietFilter";
import { Link } from "../components/Link";
import { SnackTile } from "../components/SnackTile";
import { rating } from "../lib/format";
import { useViewState } from "../lib/viewState";
import { useVoice } from "../lib/voice";

type Panel = "taste" | "saved" | "rejected" | null;

/**
 * Explore (lad mode's "The Hunt"): pick a snack type and get the snacks whose
 * community averages are closest to your taste for that type. Each type has
 * its own taste, so you can like hot crisps and mild chocolate. Your taste,
 * your saved list and your rejected list sit behind three small buttons, so
 * the suggestions get the screen.
 */
export function Explore() {
  const { t, voice } = useVoice();
  const [data, setData] = useState<ExplorePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  // All snacks by default; kept while you move round the app.
  const [filter, setFilter] = useViewState("explore.category", "");
  const [panel, setPanel] = useViewState<Panel>("explore.panel", null);
  const [diets, setDiets] = useDiets();
  const category = filterFor(voice, filter);
  const types = filterTypes(category); // null = every type
  const single = types?.length === 1 ? getCategory(types[0])! : null;

  const load = (type = category, diet = diets) =>
    api<ExplorePage>(`/explore?category=${encodeURIComponent(type)}${dietQuery(diet)}`)
      .then(setData)
      .catch((err) => setError(errorText(err)));

  useEffect(() => {
    load();
  }, []);

  const pick = (id: string) => {
    setFilter(id);
    if (panel === "taste") setPanel(null);
    load(id);
  };

  const toggle = (p: Panel) => setPanel(panel === p ? null : p);

  // Save or discard: take the card away straight away, then tell the server.
  const choose = async (s: Suggestion, choice: "saved" | "discarded") => {
    if (!data) return;
    setData({
      ...data,
      suggestions: data.suggestions.filter((x) => x.snack.id !== s.snack.id),
      saved: choice === "saved" ? [s.snack, ...data.saved] : data.saved,
      discarded: choice === "discarded" ? [s.snack, ...data.discarded] : data.discarded,
    });
    try {
      await api(`/explore/${encodeURIComponent(s.snack.id)}`, { body: { choice } });
    } catch (err) {
      setError(errorText(err));
      load();
    }
  };

  // Take a snack off your saved or rejected list, so it can be suggested again.
  const forget = async (snack: SnackSummary) => {
    if (!data) return;
    setData({
      ...data,
      saved: data.saved.filter((x) => x.id !== snack.id),
      discarded: data.discarded.filter((x) => x.id !== snack.id),
    });
    try {
      await api(`/explore/${encodeURIComponent(snack.id)}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  if (error && !data) return <p className="error page">{error}</p>;
  if (!data) return <p className="muted page">Loading…</p>;

  // Types in this filter, in pill order, and which of them have a taste set.
  const inFilter = TYPE_ORDER.filter((id) => !types || types.includes(id));
  const canSuggest = inFilter.some((id) => data.tastes[id]);
  const editing = panel === "taste";

  return (
    <div className="page stack">
      <div className="chip-scroll">
        {typeFilters(voice).map((f) => (
          <button key={f.id} type="button" className={category === f.id ? "pill on" : "pill"} onClick={() => pick(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="row wrap explore-tools">
        <button type="button" className={editing ? "pill on" : "pill"} aria-expanded={editing} onClick={() => toggle("taste")}>
          {t("explore.yourTaste")}
          {single ? ` (${single.short})` : ""}
        </button>
        <button type="button" className={panel === "saved" ? "pill on" : "pill"} aria-expanded={panel === "saved"} onClick={() => toggle("saved")}>
          {t("explore.saved")} <span className="pill-count">{data.saved.length}</span>
        </button>
        <button type="button" className={panel === "rejected" ? "pill on" : "pill"} aria-expanded={panel === "rejected"} onClick={() => toggle("rejected")}>
          {t("explore.rejected")} <span className="pill-count">{data.discarded.length}</span>
        </button>
      </div>

      {editing && (
        <TastePanel
          key={category}
          choices={inFilter}
          tastes={data.tastes}
          onCancel={() => setPanel(null)}
          onSaved={() => {
            setPanel(null);
            load();
          }}
        />
      )}

      {panel === "saved" && (
        <SnackList
          snacks={data.saved}
          empty={`Nothing yet. Tap "${t("explore.save")}" on a suggestion to keep it here.`}
          onRemove={forget}
          withCheckIn
        />
      )}

      {panel === "rejected" && (
        <SnackList
          snacks={data.discarded}
          empty={`Nothing here. Snacks you tap "${t("explore.discard")}" on land here, and you can take them back out.`}
          onRemove={forget}
          note="Take one off the list and it can be suggested again."
        />
      )}

      {error && <p className="error">{error}</p>}

      {!editing &&
        (canSuggest ? (
          <>
            <div>
              <h2 className="section-title">{t("explore.suggestions")}</h2>
              <p className="small muted no-margin">Closest to your taste, from everyone's ratings. Snacks you've had are left out.</p>
            </div>
            <DietFilter
              diets={diets}
              onChange={(next) => {
                setDiets(next);
                load(category, next);
              }}
            />
            {data.suggestions.length === 0 ? (
              <p className="muted">
                {diets.length
                  ? "Nothing checked for that diet to suggest yet."
                  : types
                    ? `No ${filterShort(category)} to suggest right now. Try another type.`
                    : t("explore.none")}
              </p>
            ) : (
              <>
                <CompareKey />
                {data.suggestions.map((s) => (
                  <SuggestionCard key={s.snack.id} s={s} prefs={data.tastes[s.snack.category] ?? {}} onChoose={(c) => choose(s, c)} />
                ))}
              </>
            )}
          </>
        ) : (
          <div className="empty">
            <p className="muted">
              Say what you like in {filterShort(category) ?? "a snack type"} and the suggestions show up here.
            </p>
            <button type="button" className="button" onClick={() => setPanel("taste")}>
              {t("explore.setTaste")}
            </button>
          </div>
        ))}
    </div>
  );
}

/**
 * Your taste, opened on request. With one type picked it edits that type;
 * under All or Rest you pick which type to edit first (ticked ones are set).
 */
function TastePanel({
  choices,
  tastes,
  onCancel,
  onSaved,
}: {
  choices: string[];
  tastes: ExplorePage["tastes"];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState(() => (choices.length === 1 ? choices[0] : choices.find((id) => tastes[id]) ?? choices[0]));
  return (
    <div className="stack-sm">
      {choices.length > 1 && (
        <div className="chip-scroll">
          {choices.map((id) => (
            <button key={id} type="button" className={type === id ? "pill on" : "pill"} onClick={() => setType(id)}>
              {tastes[id] ? "✓ " : ""}
              {getCategory(id)!.name}
            </button>
          ))}
        </div>
      )}
      <PreferenceEditor key={type} category={type} initial={tastes[type] ?? null} onCancel={onCancel} onSaved={onSaved} />
    </div>
  );
}

function SnackList({
  snacks,
  empty,
  note,
  withCheckIn = false,
  onRemove,
}: {
  snacks: SnackSummary[];
  empty: string;
  note?: string;
  withCheckIn?: boolean;
  onRemove: (s: SnackSummary) => void;
}) {
  const { t } = useVoice();
  if (!snacks.length) return <p className="small muted no-margin">{empty}</p>;
  return (
    <section className="stack-sm">
      {note && <p className="small muted no-margin">{note}</p>}
      {snacks.map((snack) => (
        <div key={snack.id} className="saved-row">
          <Link href={`/snack/${snack.id}`} className="row grow saved-link">
            <SnackTile snack={snack} size={44} />
            <span className="grow">
              <b>{snack.name}</b>
              <span className="small muted"> {snack.brand ?? getCategory(snack.category)?.short}</span>
            </span>
          </Link>
          {withCheckIn && (
            <Link href={`/checkin?snack=${encodeURIComponent(snack.id)}`} className="button small">
              {t("explore.tried")}
            </Link>
          )}
          <button type="button" className="icon-button" aria-label={`Take ${snack.name} off this list`} onClick={() => onRemove(snack)}>
            ×
          </button>
        </div>
      ))}
    </section>
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
            {s.snack.brand ? `${s.snack.brand} · ` : ""}★ {rating(Number(s.avg.toFixed(2)))} from {s.count === 1 ? "1 check-in (provisional)" : `${s.count} check-ins`}
          </span>
        </span>
        <span className="match-badge">{Math.round(s.match * 100)}%</span>
      </Link>
      <CompareBars attributes={attributesFor(s.snack.category)} mine={prefs} theirs={s.averages} />
      <div className="suggestion-buttons">
        <button type="button" className="button small" onClick={() => onChoose("saved")}>
          {t("explore.save")}
        </button>
        <button type="button" className="button secondary small" onClick={() => onChoose("discarded")}>
          {t("explore.discard")}
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
