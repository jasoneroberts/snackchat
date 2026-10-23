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

  return (
    <div className="page stack">
      <div>
        <h1 className="title">Brand logos</h1>
        <p className="small muted">
          A snack with no photo shows its maker's logo. Each maker without one gets a suggestion from Wikipedia's data or
          the maker's website: tick to use it, cross to see the next. {withLogo} of {brands.length} makers have a logo.
        </p>
        <p className="small muted">
          Logos are trademarks. Showing one small to say who makes a snack is fine for the beta; check it before a public
          launch.
        </p>
      </div>
      {error && <p className="error">{error}</p>}
      <section className="card-plain">
        {brands.map((b) => (
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

/** The next suggested logo for one maker, with Use this / Not this one. */
function Suggestion({ brand, onApproved }: { brand: string; onApproved: () => void }) {
  const [state, setState] = useState<LogoSuggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<LogoSuggestion>(`/admin/brands/suggestion?brand=${encodeURIComponent(brand)}`)
      .then(setState)
      .catch((err) => setError(errorText(err)));
  }, [brand]);

  const act = async (action: "approve" | "reject") => {
    if (!state?.suggestion) return;
    setBusy(true);
    setError(null);
    try {
      const body = { brand, url: state.suggestion.url };
      if (action === "approve") {
        await api("/admin/brands/suggestion/approve", { body });
        onApproved();
      } else {
        setState(await api<LogoSuggestion>("/admin/brands/suggestion/reject", { body }));
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="small error brand-suggestion">{error}</p>;
  if (!state) return <p className="small muted brand-suggestion">Looking for a logo…</p>;
  if (!state.suggestion) return <p className="small muted brand-suggestion">No more suggestions. Upload one if you like.</p>;

  const { suggestion } = state;
  return (
    <div className="brand-suggestion">
      <img className="snack-tile logo" src={suggestion.url} alt="" width={72} height={72} />
      <span className="grow small">
        <span className="muted">Suggested: </span>
        {suggestion.label}
        {state.more > 0 && <span className="muted"> · {state.more} more</span>}
      </span>
      <button type="button" className="icon-button suggestion-no" aria-label="Not this one" disabled={busy} onClick={() => act("reject")}>
        ✕
      </button>
      <button type="button" className="icon-button suggestion-yes" aria-label="Use this logo" disabled={busy} onClick={() => act("approve")}>
        ✓
      </button>
    </div>
  );
}
