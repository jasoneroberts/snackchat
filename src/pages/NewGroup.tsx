import { useEffect, useState, type FormEvent } from "react";
import { getCategory } from "../../shared/catalogue";
import { TYPE_ORDER } from "../../shared/typeFilters";
import type { GroupPage, ResetPeriod, ScoringMode } from "../../shared/types";
import { api, errorText } from "../api";
import { Cropper } from "../components/Cropper";
import { GroupBadge } from "../components/GroupBadge";
import { AVATAR_SIDE } from "../lib/image";
import { MODE_CHOICES, RESET_CHOICES } from "../lib/groups";
import { navigate } from "../router";
import { useVoice } from "../lib/voice";

// Starts a group, or with editId changes one you run.
export function NewGroup({ editId }: { editId?: string }) {
  const { t } = useVoice();
  const [name, setName] = useState("");
  const [scoringMode, setScoringMode] = useState<ScoringMode>("points");
  const [resetPeriod, setResetPeriod] = useState<ResetPeriod>("weekly");
  const [categories, setCategories] = useState<string[]>([]); // empty = all snack types
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!editId);
  const [pictureId, setPictureId] = useState<string | null>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [pictureBusy, setPictureBusy] = useState(false);

  // The picture saves on its own, straight away, separately from the form.
  const savePicture = async (square: Blob | null) => {
    setPicked(null);
    setPictureBusy(true);
    setError(null);
    try {
      if (square) {
        const body = new FormData();
        body.append("photo", square, "squad.jpg");
        setPictureId((await api<{ pictureId: string }>(`/groups/${encodeURIComponent(editId!)}/picture`, { body })).pictureId);
      } else {
        await api(`/groups/${encodeURIComponent(editId!)}/picture`, { method: "DELETE" });
        setPictureId(null);
      }
    } catch (err) {
      setError(errorText(err));
    }
    setPictureBusy(false);
  };

  useEffect(() => {
    if (!editId) return;
    api<GroupPage>(`/groups/${encodeURIComponent(editId)}`)
      .then(({ group }) => {
        setName(group.name);
        setScoringMode(group.scoringMode);
        setResetPeriod(group.resetPeriod);
        setCategories(group.categories ?? []);
        setPictureId(group.pictureId);
        setLoaded(true);
      })
      .catch((err) => setError(errorText(err)));
  }, [editId]);

  const toggle = (id: string) =>
    setCategories((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editId) {
        await api(`/groups/${encodeURIComponent(editId)}`, { method: "PATCH", body: { name, scoringMode, resetPeriod, categories } });
        navigate(`/groups/${editId}`);
        return;
      }
      const { id } = await api<{ id: string }>("/groups", { body: { name, scoringMode, resetPeriod, categories } });
      // Straight to inviting people: an empty group isn't much of a league.
      navigate(`/groups/${id}/invite?new=1`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  if (!loaded) return error ? <p className="error page">{error}</p> : <p className="muted page">Loading…</p>;

  return (
    <form className="page stack-lg" onSubmit={create}>
      {editId && (
        <section className="field">
          <span className="field-label">Picture</span>
          <div className="row gap-lg">
            <GroupBadge name={name || "?"} pictureId={pictureId} size={72} />
            <div className="stack-sm">
              <label className={`button secondary small ${pictureBusy ? "disabled" : ""}`}>
                <input
                  type="file"
                  accept="image/*"
                  className="visually-hidden"
                  disabled={pictureBusy}
                  onChange={(e) => {
                    setPicked(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                {pictureId ? "Change picture" : "Add a picture"}
              </label>
              {pictureId && (
                <button type="button" className="link-button small delete" disabled={pictureBusy} onClick={() => void savePicture(null)}>
                  Remove picture
                </button>
              )}
            </div>
          </div>
          <span className="small muted">{pictureBusy ? "Saving…" : "A logo or a photo of the crew. Only people in the group see it."}</span>
        </section>
      )}
      {picked && (
        <Cropper file={picked} squareOnly maxSide={AVATAR_SIDE} onDone={(blob) => void savePicture(blob)} onCancel={() => setPicked(null)} />
      )}
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
          {TYPE_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={categories.includes(id) ? "pill on" : "pill"}
              aria-pressed={categories.includes(id)}
              onClick={() => toggle(id)}
            >
              {getCategory(id)!.name}
            </button>
          ))}
        </div>
      </fieldset>

      {error && <p className="error">{error}</p>}
      <button type="submit" className="button big" disabled={busy || name.trim().length < 2}>
        {editId ? (busy ? "Saving…" : "Save changes") : busy ? "Creating…" : t("groups.create")}
      </button>
    </form>
  );
}
