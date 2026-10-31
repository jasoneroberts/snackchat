import { useEffect, useState } from "react";
import type { BrandRow, LogoSuggestion } from "../../shared/types";
import { api, ApiError, errorText } from "../api";
import { shrinkLogo } from "../lib/image";
import { refreshLogos } from "../lib/logos";

/**
 * Admin page: a logo for each maker. A snack with no community photo shows
 * its maker's logo; with neither it shows nothing. Makers without a logo get
 * a suggestion to approve or reject; rejecting shows the next one.
 */
export function BrandLogos() {
  const [brands, setBrands] = useState<BrandRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingOnly, setMissingOnly] = useState(true);

  const load = () =>
    api<{ brands: BrandRow[] }>("/admin/brands")
      .then((data) => setBrands(data.brands))
      .catch((err) => setError(errorText(err)));

  useEffect(() => {
    load();
  }, []);

  const change = async (brand: string, work: () => Promise<unknown>) => {
    setBusy(brand);
    setError(null);
    try {
      await work();
      await Promise.all([load(), refreshLogos()]);
    } catch (err) {
      // A file the browser couldn't read throws a plain Error with a useful message.
      setError(err instanceof Error && !(err instanceof ApiError) ? err.message : errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const upload = (brand: string, file: File) =>
    change(brand, async () => {
      const form = new FormData();
      form.append("brand", brand);
      form.append("logo", await shrinkLogo(file), "logo.png");
      await api("/admin/brands/logo", { body: form });
    });

  const remove = (brand: string) =>
    change(brand, () => api(`/admin/brands/logo?brand=${encodeURIComponent(brand)}`, { method: "DELETE" }));

  if (error && !brands) return <p className="error page">{error}</p>;
  if (!brands) return <p className="muted page">Loading…</p>;

  const withLogo = brands.filter((b) => b.logoId).length;
  const shown = missingOnly ? brands.filter((b) => !b.logoId) : brands;

  return (
    <div className="page stack">
      <div>
        <h1 className="title">Brand logos</h1>
        <p className="small muted">
          A snack with no photo shows its maker's logo. Each maker without one gets up to three suggestions, from logos
          you already use for a related maker, Wikipedia, Wikidata and the maker's website. Pick one and tap "Use this",
          or "None of these" to see more. {withLogo} of {brands.length} makers have a logo.
        </p>
        <p className="small muted">
          Logos are trademarks. Showing one small to say who makes a snack is normally fine, but take it down if a maker
          asks.
        </p>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="chip-scroll">
        <button type="button" className={missingOnly ? "pill on" : "pill"} onClick={() => setMissingOnly(true)}>
          Missing ({brands.length - withLogo})
        </button>
        <button type="button" className={!missingOnly ? "pill on" : "pill"} onClick={() => setMissingOnly(false)}>
          All ({brands.length})
        </button>
      </div>
      <section className="card-plain">
        {!shown.length && <p className="small muted">Every maker has a logo.</p>}
        {shown.map((b) => (
          <div key={b.brand} className="brand-item">
            <div className="brand-row">
              <span className="brand-logo-slot">
                {b.logoId && <img className="snack-tile logo" src={`/api/logos/${b.logoId}`} alt="" width={44} height={44} />}
              </span>
              <span className="grow">
                <b>{b.brand}</b>
                <span className="small muted"> · {b.snacks} {b.snacks === 1 ? "snack" : "snacks"}</span>
              </span>
              {busy === b.brand ? (
                <span className="small muted">Saving…</span>
              ) : (
                <>
                  {b.logoId && (
                    <button type="button" className="link-button delete" onClick={() => remove(b.brand)}>
                      Remove
                    </button>
                  )}
                  <label className="button secondary small">
                    {b.logoId ? "Change" : "Upload"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      aria-label={`Logo for ${b.brand}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void upload(b.brand, file);
                      }}
                    />
                  </label>
                </>
              )}
            </div>
            {!b.logoId && <Suggestion brand={b.brand} onApproved={() => void Promise.all([load(), refreshLogos()])} />}
          </div>
        ))}
      </section>
    </div>
  );
}

const SOURCE_TAG: Record<LogoSuggestion["suggestions"][number]["source"], string> = {
  alias: "Already have",
  wikidata: "Wikidata",
  wikipedia: "Wikipedia",
  website: "Their website",
  guess: "Guess",
};

/**
 * The next few suggested logos for one maker, side by side. Tap one to pick
 * it, then "Use this"; "None of these" rejects them all and shows the next.
 */
function Suggestion({ brand, onApproved }: { brand: string; onApproved: () => void }) {
  const [state, setState] = useState<LogoSuggestion | null>(null);
  const [picked, setPicked] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const show = (next: LogoSuggestion) => {
    setState(next);
    setPicked(0);
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await work();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const look = () => {
    setError(null);
    setState(null);
    api<LogoSuggestion>(`/admin/brands/suggestion?brand=${encodeURIComponent(brand)}`)
      .then(show)
      .catch((err) => setError(errorText(err)));
  };

  useEffect(look, [brand]);

  const approve = (url: string) =>
    run(async () => {
      // A logo that won't download after all comes back as { failed, next suggestions }.
      const result = await api<LogoSuggestion & { failed?: boolean }>("/admin/brands/suggestion/approve", { body: { brand, url } });
      if (result.failed) {
        setNote("That one wouldn't download, so here are the next.");
        show(result);
      } else {
        onApproved();
      }
    });

  const reject = (urls: string[]) =>
    run(async () => show(await api<LogoSuggestion>("/admin/brands/suggestion/reject", { body: { brand, urls } })));

  const startOver = () =>
    run(async () => {
      setState(null);
      show(await api<LogoSuggestion>(`/admin/brands/suggestion/rejects?brand=${encodeURIComponent(brand)}`, { method: "DELETE" }));
    });

  // A picture that won't show in the browser either is quietly dropped.
  const broken = (url: string) => {
    if (!state || busy) return;
    const left = state.suggestions.filter((s) => s.url !== url);
    setState({ ...state, suggestions: left });
    setPicked(0);
    void api<LogoSuggestion>("/admin/brands/suggestion/reject", { body: { brand, urls: [url] } })
      .then((next) => {
        if (!left.length) show(next);
      })
      .catch(() => {});
  };

  if (error) return <p className="small error brand-suggestion-note">{error}</p>;
  if (!state) return <p className="small muted brand-suggestion-note">Looking for logos…</p>;
  if (!state.suggestions.length) {
    return (
      <p className="small muted brand-suggestion-note">
        {state.more > 0 ? (
          <>
            The last few suggestions wouldn't load.{" "}
            <button type="button" className="link-button" onClick={look}>
              Try {state.more} more
            </button>
          </>
        ) : (
          <>
            No more suggestions. Upload one, or{" "}
            <button type="button" className="link-button" disabled={busy} onClick={startOver}>
              start over
            </button>{" "}
            to see ones you said no to again.
          </>
        )}
      </p>
    );
  }

  const { suggestions } = state;
  const choice = suggestions[Math.min(picked, suggestions.length - 1)];
  return (
    <div className="brand-suggestions">
      {note && <p className="small notice-inline">{note}</p>}
      <div className="logo-picks" role="radiogroup" aria-label={`Suggested logos for ${brand}`}>
        {suggestions.map((s, i) => (
          <button
            key={s.url}
            type="button"
            role="radio"
            aria-checked={s === choice}
            className={`logo-pick${s === choice ? " picked" : ""}`}
            disabled={busy}
            onClick={() => setPicked(i)}
          >
            <img src={s.url} alt="" width={60} height={60} onError={() => broken(s.url)} />
            <span className="logo-pick-tag">{SOURCE_TAG[s.source]}</span>
          </button>
        ))}
      </div>
      <p className="small">
        {choice.label}
        {state.more > 0 && <span className="muted"> · {state.more} more after these</span>}
      </p>
      <div className="brand-suggestion-actions">
        <button type="button" className="button small" disabled={busy} onClick={() => approve(choice.url)}>
          {busy ? "Saving…" : "Use this"}
        </button>
        <button type="button" className="link-button" disabled={busy} onClick={() => reject(suggestions.map((s) => s.url))}>
          {suggestions.length === 1 ? "Not this one" : "None of these"}
        </button>
      </div>
    </div>
  );
}
