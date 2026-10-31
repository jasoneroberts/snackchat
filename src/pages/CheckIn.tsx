import { useEffect, useRef, useState, type FormEvent } from "react";
import { CATEGORIES, POINTS, REVIEW_BONUS_CHARS, attributesFor, getCategory } from "../../shared/catalogue";
import type { CheckinForEdit, SnackPage, SnackSummary } from "../../shared/types";
import { api, errorText } from "../api";
import { Cropper } from "../components/Cropper";
import { ShareCheckin } from "../components/ShareCheckin";
import type { BadgeState } from "../../shared/achievements";
import { SnackTile } from "../components/SnackTile";
import { StarPicker } from "../components/Stars";
import { useVoice } from "../lib/voice";

export function CheckIn({
  editId,
  username,
  onDone,
  onSaved,
}: {
  /** Set to change one of your check-ins instead of making a new one. */
  editId?: string;
  username: string; // for the share picture

  onDone: (snackName: string, points: number, withPhoto: boolean) => void;
  onSaved?: (photoPending: boolean) => void;
}) {
  const [snack, setSnack] = useState<SnackSummary | null>(null);
  const [overall, setOverall] = useState<number | null>(null);
  const [attrs, setAttrs] = useState<Record<string, number>>({});
  const [review, setReview] = useState("");
  const [venue, setVenue] = useState("");
  const [pairedWith, setPairedWith] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  // The photo as taken, kept so it can be cropped again. Set while the cropper is open.
  const [original, setOriginal] = useState<File | null>(null);
  const [cropping, setCropping] = useState(false);
  // Editing: the photo the check-in already has, until it's removed or replaced.
  const [existing, setExisting] = useState<CheckinForEdit["photo"]>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Posted: the share screen shows until they tap Done.
  const [posted, setPosted] = useState<{ points: number; photoPending: boolean; newBadges: BadgeState[] } | null>(null);
  const { t } = useVoice();

  // Editing: fill the form in from the check-in as it is.
  useEffect(() => {
    if (!editId) return;
    api<{ checkin: CheckinForEdit }>(`/checkins/${encodeURIComponent(editId)}`)
      .then(({ checkin }) => {
        setSnack(checkin.snack);
        setOverall(checkin.overall);
        setAttrs(checkin.attributes);
        setReview(checkin.review ?? "");
        setVenue(checkin.venue ?? "");
        setPairedWith(checkin.pairedWith ?? "");
        setExisting(checkin.photo);
      })
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoading(false));
  }, [editId]);

  // Arriving from a snack page ("Check in this snack") picks that snack.
  useEffect(() => {
    if (editId) return;
    const id = new URLSearchParams(window.location.search).get("snack");
    if (id) api<SnackPage>(`/snacks/${encodeURIComponent(id)}`).then((d) => setSnack(d.snack)).catch(() => {});
  }, []);

  // Free the preview image's memory when it's replaced or the page closes.
  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo]);

  const pickSnack = (s: SnackSummary | null) => {
    setSnack(s);
    setAttrs({}); // sliders differ between snack types
  };

  // A new photo opens the cropper first; "Use photo" there gives the cropped, shrunk JPEG.
  const onPhoto = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setOriginal(file);
    setCropping(true);
  };

  const onCropped = (blob: Blob) => {
    setCropping(false);
    setPhoto({ blob, url: URL.createObjectURL(blob) });
  };

  const removePhoto = () => {
    setPhoto(null);
    setOriginal(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!snack || overall === null) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set(
      "data",
      JSON.stringify({ snackId: snack.id, overall, attributes: attrs, review, venue, pairedWith }),
    );
    if (photo) form.set("photo", photo.blob, "photo.jpg");
    if (editId) {
      form.set(
        "data",
        JSON.stringify({ overall, attributes: attrs, review, venue, pairedWith, removePhoto: removeExisting && !photo }),
      );
      try {
        const res = await api<{ photoPending: boolean }>(`/checkins/${encodeURIComponent(editId)}`, { method: "PATCH", body: form });
        onSaved?.(res.photoPending);
      } catch (err) {
        setError(errorText(err));
        setBusy(false);
      }
      return;
    }
    try {
      const res = await api<{ points: number; photoPending: boolean; newBadges?: BadgeState[] }>("/checkins", { body: form });
      setPosted({ points: res.points, photoPending: res.photoPending, newBadges: res.newBadges ?? [] });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const category = snack ? getCategory(snack.category) : undefined;
  const reviewBonus = review.trim().length >= REVIEW_BONUS_CHARS;
  // Kids snacks keep grown-up words, and crisps are "crunch" while chocolate is "munch".
  const about = { category: snack?.category };

  if (loading) return <p className="muted page">Loading…</p>;
  if (posted && snack && overall !== null) {
    return (
      <ShareCheckin
        points={posted.points}
        snack={snack}
        rating={overall}
        username={username}
        review={review.trim() || null}
        photo={photo?.blob ?? null}
        newBadges={posted.newBadges}
        onDone={() => onDone(snack.name, posted.points, posted.photoPending)}
      />
    );
  }
  // The photo already on the check-in, while it's still being kept.
  const kept = editId && existing && !removeExisting && !photo ? existing : null;

  return (
    <form className="page stack" onSubmit={submit}>
      {editId && snack && (
        <p className="small muted no-margin">
          Change anything except the snack. Points stay as they were. A new photo is checked again before others see it.
        </p>
      )}
      {snack ? (
        <div className="snack-chosen">
          <SnackTile snack={snack} size={56} />
          <div className="grow">
            <b className="big-text">{snack.name}</b>
            <div className="small muted">
              {[snack.brand, category?.name].filter(Boolean).join(" · ")}
              {snack.status === "pending" && <span className="tag">new, pending</span>}
            </div>
          </div>
          {!editId && (
            <button type="button" className="link-button" onClick={() => pickSnack(null)}>
              Change
            </button>
          )}
        </div>
      ) : (
        <SnackSearch onPick={pickSnack} />
      )}

      {snack && (
        <>
          {kept ? (
            <div className="photo-preview">
              <img src={`/api/photos/${kept.id}`} alt="Your photo" />
              {kept.status === "pending" && <span className="tag">waiting for approval</span>}
              <div className="photo-preview-actions">
                <label className="link-button small">
                  <input
                    type="file"
                    accept="image/*"
                    className="visually-hidden"
                    onChange={(e) => {
                      onPhoto(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  Replace photo
                </label>
                <button type="button" className="link-button small" onClick={() => setRemoveExisting(true)}>
                  Remove photo
                </button>
              </div>
            </div>
          ) : photo ? (
            <div className="photo-preview">
              <img src={photo.url} alt="Your photo" />
              <div className="photo-preview-actions">
                {original && (
                  <button type="button" className="link-button small" onClick={() => setCropping(true)}>
                    Crop again
                  </button>
                )}
                <button type="button" className="link-button small" onClick={removePhoto}>
                  Remove photo
                </button>
              </div>
            </div>
          ) : (
            <div className="photo-drop">
              <span>{t("checkin.photo", { ...about, vars: { pts: POINTS.photo } })}</span>
              <span className="small muted">Photos show to everyone once they're approved.</span>
              <div className="photo-buttons">
                {/* capture="environment" opens the back camera straight away on phones. */}
                <label className="button">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="visually-hidden"
                    onChange={(e) => {
                      onPhoto(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="15" rx="3" />
                    <circle cx="12" cy="12.5" r="3.5" />
                    <path d="M8 5l1.5-2h5L16 5" />
                  </svg>
                  Take photo
                </label>
                <label className="button secondary">
                  <input
                    type="file"
                    accept="image/*"
                    className="visually-hidden"
                    onChange={(e) => {
                      onPhoto(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  Choose photo
                </label>
              </div>
            </div>
          )}

          <div className="field">
            <span className="field-label">{t("checkin.rating", about)}</span>
            <StarPicker value={overall} onChange={setOverall} />
          </div>

          <div className="card-plain stack-sm">
            <div>
              <div className="field-label">{t("checkin.describe", about)}</div>
              <div className="small muted">Optional. Spice 1 means mild, not bad.</div>
            </div>
            {attributesFor(snack.category).map((a) => {
              const v = attrs[a.key] ?? 0;
              return (
                <div key={a.key} className="slider">
                  <div className="slider-top">
                    <label htmlFor={`attr-${a.key}`}>{a.label}</label>
                    <b>{v ? `${v}/5` : "skip"}</b>
                  </div>
                  <input
                    id={`attr-${a.key}`}
                    type="range"
                    min={0}
                    max={5}
                    step={1}
                    value={v}
                    onChange={(e) => setAttrs({ ...attrs, [a.key]: Number(e.target.value) })}
                  />
                  <div className="slider-ends">
                    <span>{a.low}</span>
                    <span>{a.high}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <label className="field">
            <span className="field-label">{t("checkin.review", about)}</span>
            <textarea
              rows={3}
              maxLength={1000}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder={t("checkin.reviewPlaceholder", { ...about, vars: { chars: REVIEW_BONUS_CHARS, pts: POINTS.review } })}
            />
            {review && !reviewBonus && (
              <span className="small muted">{REVIEW_BONUS_CHARS - review.trim().length} more characters for the bonus</span>
            )}
          </label>

          <div className="two-up">
            <label className="field">
              <span className="field-label">{t("checkin.where", about)}</span>
              <input value={venue} maxLength={80} onChange={(e) => setVenue(e.target.value)} placeholder="The Red Lion" />
            </label>
            <label className="field">
              <span className="field-label">{t("checkin.with", about)}</span>
              <input
                value={pairedWith}
                maxLength={80}
                onChange={(e) => setPairedWith(e.target.value)}
                placeholder="A pint of bitter"
              />
            </label>
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}

      {snack && (
        <button type="submit" className="button big" disabled={overall === null || busy}>
          {editId
            ? busy
              ? "Saving…"
              : "Save changes"
            : busy
              ? t("checkin.busy", about)
              : overall === null
                ? t("checkin.needRating", about)
                : t("checkin.submit", about)}
        </button>
      )}
      {cropping && original && (
        <Cropper
          file={original}
          onDone={onCropped}
          onCancel={() => {
            setCropping(false);
            // Cancelled before there was any photo: forget the one they picked.
            if (!photo) setOriginal(null);
          }}
        />
      )}
    </form>
  );
}

/** Search the catalogue as you type, or add a snack that isn't there yet. */
function SnackSearch({ onPick }: { onPick: (s: SnackSummary) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SnackSummary[] | null>(null);
  const [adding, setAdding] = useState(false);
  const latest = useRef(0);
  const { t } = useVoice();

  useEffect(() => {
    // Wait for a pause in typing, and ignore replies to older searches.
    const ticket = ++latest.current;
    const timer = setTimeout(
      () => {
        api<{ snacks: SnackSummary[] }>(`/snacks?q=${encodeURIComponent(q.trim())}`)
          .then((r) => ticket === latest.current && setResults(r.snacks))
          .catch(() => ticket === latest.current && setResults([]));
      },
      q ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [q]);

  if (adding) return <AddSnack initialName={q.trim()} onAdded={onPick} onCancel={() => setAdding(false)} />;

  return (
    <div className="field">
      <label htmlFor="snack-search" className="field-label">
        {t("checkin.search")}
      </label>
      <input
        id="snack-search"
        type="search"
        autoComplete="off"
        placeholder={t("checkin.searchPlaceholder")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {!q && results && results.length > 0 && <span className="small muted">{t("checkin.popular")}</span>}
      <div className="results">
        {results?.map((s) => (
          <button key={s.id} type="button" className="result" onClick={() => onPick(s)}>
            <SnackTile snack={s} size={44} />
            <span className="grow">
              <b>{s.name}</b>
              <span className="small muted block">
                {[s.brand, getCategory(s.category)?.name].filter(Boolean).join(" · ")}
              </span>
            </span>
          </button>
        ))}
      </div>
      {q.trim().length >= 2 && (
        <button type="button" className="button secondary" onClick={() => setAdding(true)}>
          {t("checkin.addMissing", { vars: { q: q.trim() } })}
        </button>
      )}
    </div>
  );
}

function AddSnack({
  initialName,
  onAdded,
  onCancel,
}: {
  initialName: string;
  onAdded: (s: SnackSummary) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [brands, setBrands] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { t } = useVoice();

  useEffect(() => {
    api<{ brands: string[] }>("/snacks/brands")
      .then((r) => setBrands(r.brands))
      .catch(() => {});
  }, []);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ snack: SnackSummary }>("/snacks", { body: { name, brand, category } });
      onAdded(res.snack);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <div className="card-plain stack-sm">
      <div>
        <div className="field-label">{t("checkin.addTitle")}</div>
        <div className="small muted">New snacks show as pending until they're confirmed, but you can check in straight away.</div>
      </div>
      <label className="field">
        <span>Name</span>
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Prawn Cocktail" />
      </label>
      <label className="field">
        <span>Maker (optional)</span>
        <input value={brand} maxLength={60} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Walkers" list="known-brands" autoComplete="off" />
        {/* Makers already in Crunchd, suggested as you type. */}
        <datalist id="known-brands">
          {brands.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </label>
      <div className="field">
        <span>Type</span>
        <div className="row wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={category === c.id ? "pill on" : "pill"}
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" className="button" disabled={busy || name.trim().length < 2 || !category} onClick={add}>
          {busy ? "Adding…" : "Add snack"}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Back to search
        </button>
      </div>
    </div>
  );
}
