import { useEffect, useMemo, useState } from "react";
import { getCategory } from "../../shared/catalogue";
import { filterFor, filterTypes, TYPE_ORDER, typeFilters } from "../../shared/typeFilters";
import type { SnackSummary } from "../../shared/types";
import { api, errorText } from "../api";
import { Link } from "../components/Link";
import { SnackTile } from "../components/SnackTile";
import { useViewState } from "../lib/viewState";
import { useVoice } from "../lib/voice";

/**
 * Settings > All snacks: every snack in Crunchd, A to Z. Anyone can ask for
 * a snack's name, maker, type or photo to be put right; the request goes to
 * the admins (Settings > Reports) and they make the change.
 */
export function AllSnacks() {
  const { voice } = useVoice();
  const [snacks, setSnacks] = useState<SnackSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useViewState("allSnacks.category", "");
  const [changing, setChanging] = useState<SnackSummary | null>(null);
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const category = filterFor(voice, filter);

  useEffect(() => {
    api<{ snacks: SnackSummary[] }>("/snacks/all")
      .then((r) => setSnacks(r.snacks))
      .catch((err) => setError(errorText(err)));
  }, []);

  const shown = useMemo(() => {
    const types = filterTypes(category);
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (snacks ?? []).filter((s) => {
      if (types && !types.includes(s.category)) return false;
      const text = `${s.name} ${s.brand ?? ""}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [snacks, category, query]);

  if (error) return <p className="error page">{error}</p>;
  if (!snacks) return <p className="muted page">Loading…</p>;

  return (
    <div className="page stack">
      <p className="small muted no-margin">
        Spotted a wrong name, maker or type, or a photo that needs changing? Tap the snack and say what's wrong. An
        admin will sort it.
      </p>
      <input type="search" placeholder="Search snacks or makers" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chip-scroll">
        {typeFilters(voice).map((f) => (
          <button key={f.id} type="button" className={category === f.id ? "pill on" : "pill"} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <p className="small muted no-margin">
        {shown.length} {shown.length === 1 ? "snack" : "snacks"}
      </p>
      <div className="stack-sm">
        {shown.map((s) => (
          <div key={s.id} className="saved-row">
            <Link href={`/snack/${s.id}`} className="row grow saved-link">
              <SnackTile snack={s} size={44} />
              <span className="grow">
                <b className="block">{s.name}</b>
                <span className="small muted">{[s.brand, getCategory(s.category)?.short].filter(Boolean).join(" · ")}</span>
              </span>
            </Link>
            {asked.has(s.id) ? (
              <span className="small muted">Asked</span>
            ) : (
              <button type="button" className="button secondary small" onClick={() => setChanging(s)}>
                Suggest a change
              </button>
            )}
          </div>
        ))}
      </div>
      {changing && (
        <ChangeSheet
          snack={changing}
          onClose={() => setChanging(null)}
          onSent={() => {
            setAsked((prev) => new Set(prev).add(changing.id));
            setChanging(null);
          }}
        />
      )}
    </div>
  );
}

type What = "details" | "photo";

const PHOTO_PROBLEMS = ["It's the wrong snack", "It's blurry or hard to see", "It's an old pack design", "It's not suitable"];

/** Ask for a snack's details or photo to be changed. Sent as a request the admins see. */
function ChangeSheet({ snack, onClose, onSent }: { snack: SnackSummary; onClose: () => void; onSent: () => void }) {
  const [what, setWhat] = useState<What>("details");
  const [name, setName] = useState(snack.name);
  const [brand, setBrand] = useState(snack.brand ?? "");
  const [type, setType] = useState(snack.category);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The admin reads this as one note, so spell out each change as "old → new".
  const summary = (() => {
    const lines: string[] = [];
    if (what === "details") {
      if (name.trim() && name.trim() !== snack.name) lines.push(`Name: ${snack.name} → ${name.trim()}`);
      if (brand.trim() !== (snack.brand ?? "")) lines.push(`Maker: ${snack.brand ?? "none"} → ${brand.trim() || "none"}`);
      if (type !== snack.category) lines.push(`Type: ${getCategory(snack.category)?.name} → ${getCategory(type)?.name}`);
    } else if (problem) {
      lines.push(`Photo: ${problem}`);
    }
    if (note.trim()) lines.push(note.trim());
    return lines.join("\n");
  })();

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/reports", { body: { targetType: "snack", targetId: snack.id, reason: what, note: summary } });
      onSent();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet stack-sm" role="dialog" aria-modal="true" aria-label={`Suggest a change to ${snack.name}`} onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title">Suggest a change</h2>
        <p className="small muted no-margin">
          {snack.name}
          {snack.brand ? ` by ${snack.brand}` : ""}
        </p>
        <div className="segmented small">
          {(["details", "photo"] as What[]).map((w) => (
            <button key={w} type="button" className={what === w ? "on" : ""} aria-pressed={what === w} onClick={() => setWhat(w)}>
              {w === "details" ? "Name, maker or type" : "Photo"}
            </button>
          ))}
        </div>

        {what === "details" ? (
          <>
            <label className="field">
              <span className="field-label">Name</span>
              <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Maker</span>
              <input value={brand} maxLength={60} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Walkers" />
            </label>
            <label className="field">
              <span className="field-label">Type</span>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {TYPE_ORDER.map((id) => (
                  <option key={id} value={id}>
                    {getCategory(id)!.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <div className="stack-sm">
              {PHOTO_PROBLEMS.map((p) => (
                <button key={p} type="button" className={problem === p ? "choice on" : "choice"} aria-pressed={problem === p} onClick={() => setProblem(p)}>
                  {p}
                </button>
              ))}
            </div>
            <p className="small muted no-margin">
              Got a better photo? <Link href={`/checkin?snack=${encodeURIComponent(snack.id)}`}>Check it in with your photo</Link>{" "}
              and say so below, and an admin can make it the main one.
            </p>
          </>
        )}

        <label className="field">
          <span className="field-label">Anything else? (optional)</span>
          <textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button grow" disabled={busy || !summary} onClick={send}>
            {busy ? "Sending…" : "Send to the admins"}
          </button>
        </div>
      </div>
    </div>
  );
}
