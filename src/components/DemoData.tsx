import { useEffect, useState } from "react";
import type { DemoStatus } from "../../shared/types";
import { api, errorText } from "../api";

/**
 * Admin card for removing leftover demo people and their check-ins. Crunchd
 * is public now, so demo data can't be added any more (UK law bans fake
 * reviews); once it's all gone the card disappears.
 */
export function DemoData({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<DemoStatus>("/admin/demo").then(setStatus);
  useEffect(() => {
    load().catch((err) => setError(errorText(err)));
  }, []);

  const removeAll = async () => {
    if (!confirm("Remove all demo people, their check-ins, photos and the demo groups?")) return;
    setBusy(true);
    setError(null);
    try {
      await api("/admin/demo", { method: "DELETE" });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      await load().catch(() => {});
      onChanged();
    }
  };

  if (error && !status) return <p className="error">{error}</p>;
  if (!status || status.users === 0) return null;

  return (
    <section className="card-plain stack-sm">
      <h2 className="section-title">Demo data</h2>
      <p className="small muted">
        {status.users} demo people, {status.checkins} check-ins and {status.photos} photos are still loaded. Remove them now
        Crunchd is public: fake reviews aren't allowed under UK law.
      </p>
      {error && <p className="error">{error}</p>}
      <button type="button" className="button" disabled={busy} onClick={() => void removeAll()}>
        {busy ? "Removing…" : "Remove demo data"}
      </button>
    </section>
  );
}
