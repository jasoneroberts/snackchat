import { useEffect, useState } from "react";
import type { DemoStatus } from "../../shared/types";
import { api, errorText } from "../api";

// Open Food Facts allows about 10 searches a minute, so photos are fetched
// one snack at a time with a pause in between.
const PHOTO_GAP_MS = 6500;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Admin card: load demo people, check-ins and photos, or remove them all. */
export function DemoData({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<DemoStatus>("/admin/demo").then(setStatus);
  useEffect(() => {
    load().catch((err) => setError(errorText(err)));
  }, []);

  const run = async (work: () => Promise<void>) => {
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setProgress(null);
      await load().catch(() => {});
      onChanged();
    }
  };

  // Profile pictures first (one quick call), then pack photos snack by snack.
  const fillIn = async (s: DemoStatus) => {
    if (s.missingAvatars > 0) {
      setProgress("Adding profile pictures…");
      await api("/admin/demo/avatars", { method: "POST" });
    }
    await fetchPhotos(s.missingPhotos);
  };

  const fetchPhotos = async (snackIds: string[]) => {
    for (const [i, id] of snackIds.entries()) {
      setProgress(`Finding pack photos… ${i + 1} of ${snackIds.length}. Keep this page open.`);
      await api(`/admin/demo/photos/${id}`, { method: "POST" });
      if (i < snackIds.length - 1) await wait(PHOTO_GAP_MS);
    }
  };

  const addAll = () =>
    run(async () => {
      setProgress("Adding demo people and check-ins…");
      await api("/admin/demo", { method: "POST" });
      const fresh = await api<DemoStatus>("/admin/demo");
      setStatus(fresh);
      await fillIn(fresh);
    });

  const removeAll = () => {
    if (!confirm("Remove all demo people, their check-ins, photos and the demo groups?")) return;
    void run(async () => {
      setProgress("Removing demo data…");
      await api("/admin/demo", { method: "DELETE" });
    });
  };

  if (!status) return null;
  const loaded = status.users > 0;
  const busy = progress !== null;

  return (
    <section className="card-plain stack-sm">
      <h2 className="section-title">Demo data</h2>
      <p className="small muted">
        {loaded
          ? `${status.users} demo people, ${status.checkins} check-ins and ${status.photos} photos are loaded. You're in their two groups.`
          : "Adds 8 made-up people with profile pictures, three weeks of check-ins, pack photos from Open Food Facts, and two groups you're in. Remove it all in one tap later."}
      </p>
      {progress && <p className="small notice">{progress}</p>}
      {error && <p className="error">{error}</p>}
      {!loaded && (
        <button type="button" className="button" disabled={busy} onClick={() => void addAll()}>
          Load demo data
        </button>
      )}
      {loaded && (status.missingPhotos.length > 0 || status.missingAvatars > 0) && (
        <button type="button" className="button secondary" disabled={busy} onClick={() => void run(() => fillIn(status))}>
          Add photos and profile pictures
        </button>
      )}
      {loaded && (
        <button type="button" className="button secondary" disabled={busy} onClick={removeAll}>
          Remove demo data
        </button>
      )}
    </section>
  );
}
