import { useEffect, useState } from "react";
import { CATEGORIES, getCategory } from "../../shared/catalogue";
import type { AdminSnackPhoto, AdminSnackRow } from "../../shared/types";
import { api, errorText } from "../api";
import { Link } from "../components/Link";
import { SnackTile } from "../components/SnackTile";
import { timeAgo } from "../lib/format";
import { useLogo } from "../lib/logos";
import { photoUrl } from "../lib/photos";

type Filter = "all" | "pending" | "nopic";

/**
 * Admin page: every snack, to fix typos, the wrong maker or type, and wrong
 * photos. New snacks people add wait at the top for a yes or no.
 */
export function AdminSnacks({ onChanged }: { onChanged: () => void }) {
  const [snacks, setSnacks] = useState<AdminSnackRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);

  const load = () =>
    api<{ snacks: AdminSnackRow[] }>("/admin/snacks")
      .then((data) => setSnacks(data.snacks))
      .catch((err) => setError(errorText(err)));

  useEffect(() => {
    load();
  }, []);

  if (error && !snacks) return <p className="error page">{error}</p>;
  if (!snacks) return <p className="muted page">Loading…</p>;

  const pending = snacks.filter((s) => s.status === "pending").length;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = snacks.filter((s) => {
    if (filter === "pending" && s.status !== "pending") return false;
    if (filter === "nopic" && s.photoId) return false;
    const text = `${s.name} ${s.brand ?? ""}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });

  return (
    <div className="page stack">
      <p className="small muted no-margin">
        Tap a snack to fix its name, maker or type, pick its main picture, or hide a wrong photo. {snacks.length} snacks
        {pending ? `, ${pending} waiting for a yes or no` : ""}.
      </p>
      <input type="search" placeholder="Search snacks or makers" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chip-scroll">
        {(
          [
            ["all", "All"],
            ["pending", `Waiting${pending ? ` (${pending})` : ""}`],
            ["nopic", "No photo"],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button key={key} type="button" className={filter === key ? "pill on" : "pill"} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {shown.length === 0 ? (
        <p className="muted">No snacks match.</p>
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
                  {s.status === "pending" && <span className="tag waiting">waiting</span>}
                  {s.status === "rejected" && <span className="tag">rejected</span>}
                  <span className="small muted block">
                    {s.brand ?? "No maker"} · {getCategory(s.category)?.short ?? s.category} · {s.checkins}{" "}
                    {s.checkins === 1 ? "check-in" : "check-ins"}
                  </span>
                </span>
                <span className="chevron" aria-hidden="true">{open === s.id ? "▴" : "▾"}</span>
              </button>
              {open === s.id && (
                <SnackEditor
                  snack={s}
                  onSaved={() => {
                    load();
                    onChanged();
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

function SnackEditor({ snack, onSaved }: { snack: AdminSnackRow; onSaved: () => void }) {
  const [name, setName] = useState(snack.name);
  const [brand, setBrand] = useState(snack.brand ?? "");
  const [category, setCategory] = useState(snack.category);
  const [photos, setPhotos] = useState<AdminSnackPhoto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const logoId = useLogo(snack.brand);

  useEffect(() => {
    api<{ photos: AdminSnackPhoto[] }>(`/admin/snacks/${encodeURIComponent(snack.id)}/photos`)
      .then((data) => setPhotos(data.photos))
      .catch((err) => setError(errorText(err)));
  }, [snack.id]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await work();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changed = name !== snack.name || brand !== (snack.brand ?? "") || category !== snack.category;
  const id = encodeURIComponent(snack.id);

  const save = async () => {
    if (await run(() => api(`/admin/snacks/${id}`, { method: "PATCH", body: { name, brand, category } }))) {
      setSaved(true);
      onSaved();
    }
  };

  const decide = async (action: "approve" | "reject") => {
    // Save any fixes first, so approving a misspelt snack approves the corrected name.
    if (changed && !(await run(() => api(`/admin/snacks/${id}`, { method: "PATCH", body: { name, brand, category } })))) return;
    if (await run(() => api(`/admin/snacks/${id}/status`, { body: { action } }))) onSaved();
  };

  const hide = async (photo: AdminSnackPhoto) => {
    if (!confirm(`Hide ${photo.username}'s photo? It stops showing everywhere. Their check-in and points stay.`)) return;
    if (await run(() => api(`/admin/photos/${encodeURIComponent(photo.id)}/hide`, { body: {} }))) {
      setPhotos((list) => list?.filter((p) => p.id !== photo.id) ?? null);
      onSaved();
    }
  };

  // Choose which photo is the snack's main picture, or null to go back to the newest.
  const makeMain = async (photoId: string | null) => {
    if (await run(() => api(`/admin/snacks/${id}/cover`, { method: "PUT", body: { photoId } }))) {
      setPhotos((list) => list?.map((p) => ({ ...p, isCover: p.id === photoId })) ?? null);
      onSaved();
    }
  };
  // The one showing now: the picked one, else the newest (photos come newest first).
  const mainId = photos?.find((p) => p.isCover)?.id ?? photos?.[0]?.id;
  const picked = photos?.some((p) => p.isCover) ?? false;

  return (
    <div className="snack-editor stack-sm">
      {snack.addedBy && (
        <p className="small muted no-margin">
          Added by {snack.addedBy} {timeAgo(snack.createdAt)}
        </p>
      )}
      <label className="field">
        <span className="field-label">Name</span>
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Maker</span>
        <input value={brand} maxLength={60} placeholder="e.g. Walkers" onChange={(e) => setBrand(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Type</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      {snack.status === "pending" ? (
        <div className="row">
          <button type="button" className="button secondary grow" disabled={busy} onClick={() => decide("reject")}>
            Reject
          </button>
          <button type="button" className="button grow" disabled={busy} onClick={() => decide("approve")}>
            {changed ? "Save and approve" : "Approve"}
          </button>
        </div>
      ) : (
        <div className="row">
          {saved && <span className="small muted grow">Saved.</span>}
          <button type="button" className="button small" disabled={busy || !changed} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      <div>
        <div className="field-label">Photos</div>
        {photos && photos.length > 1 && (
          <p className="small muted no-margin">
            {picked ? "You picked the main picture. " : "The newest photo is the main picture. "}
            Tap Use on any photo to show it instead.
            {picked && (
              <>
                {" "}
                <button type="button" className="link-button" disabled={busy} onClick={() => makeMain(null)}>
                  Go back to newest
                </button>
              </>
            )}
          </p>
        )}
        {photos === null ? (
          <p className="small muted no-margin">Loading…</p>
        ) : photos.length === 0 ? (
          <p className="small muted no-margin">No photos yet.</p>
        ) : (
          <div className="admin-photos">
            {photos.map((p) => (
              <figure key={p.id} className={p.id === mainId ? "admin-photo main" : "admin-photo"}>
                <img src={photoUrl(p.id, "small")} alt="" loading="lazy" />
                <figcaption className="small muted">{p.username}</figcaption>
                <span className="admin-photo-actions small">
                  {p.id === mainId ? (
                    <b className="main-label">Main</b>
                  ) : (
                    <button type="button" className="link-button" disabled={busy} onClick={() => makeMain(p.id)}>
                      Use
                    </button>
                  )}
                  <button type="button" className="link-button" disabled={busy} onClick={() => hide(p)}>
                    Hide
                  </button>
                </span>
              </figure>
            ))}
          </div>
        )}
      </div>
      <p className="small muted no-margin">
        {snack.brand ? (logoId ? `${snack.brand} has a logo. ` : `${snack.brand} has no logo yet. `) : ""}
        Logos are set per maker on <Link href="/brands">Brand logos</Link>.
        {snack.status !== "pending" && (
          <>
            {" "}
            <Link href={`/snack/${snack.id}`}>Open the snack's page</Link>
          </>
        )}
      </p>
    </div>
  );
}
