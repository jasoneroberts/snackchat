import { useEffect, useState } from "react";
import type { FeedItem } from "../../shared/types";
import { api, errorText, type Me } from "../api";
import { CheckinCard } from "../components/CheckinCard";
import { Link } from "../components/Link";
import { CotwCard } from "./Cotw";
import { useVoice } from "../lib/voice";
import { readSnapshot, writeSnapshot } from "../lib/snapshot";

export function Feed({ me, onChanged }: { me: Me; onChanged: () => void }) {
  // The feed as it was last time, drawn straight away while the fresh one loads (lib/snapshot.ts).
  const snapKey = `feed.${me.id}`;
  const [items, setItems] = useState<FeedItem[] | null>(() => readSnapshot<FeedItem[]>(snapKey));
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const { t } = useVoice();

  const load = async (before?: string) => {
    const page = await api<{ items: FeedItem[]; next: string | null }>(
      `/checkins${before ? `?before=${encodeURIComponent(before)}` : ""}`,
    );
    setItems((prev) => (before && prev ? [...prev, ...page.items] : page.items));
    setNext(page.next);
    setError(null);
    if (!before) writeSnapshot(snapKey, page.items);
  };

  useEffect(() => {
    load().catch((err) => setError(errorText(err)));
  }, []);

  const remove = async (id: string) => {
    try {
      await api(`/checkins/${id}`, { method: "DELETE" });
      setItems((prev) => prev?.filter((i) => i.id !== id) ?? null);
      onChanged();
    } catch (err) {
      setError(errorText(err));
    }
  };

  // With a last-seen copy on screen, a failed refresh (no signal) leaves it up.
  if (error && !items) return <p className="error page">{error}</p>;
  if (!items) return <p className="muted page">Loading…</p>;

  return (
    <div className="page stack">
      {error && <p className="error">{error}</p>}
      <CotwCard me={me} />
      {items.length === 0 && (
        <div className="empty">
          <h2>{t("feed.emptyTitle")}</h2>
          <p className="muted">{t("feed.emptyBody")}</p>
          <Link href="/checkin" className="button">
            {t("feed.emptyButton")}
          </Link>
        </div>
      )}
      {items.map((item) => (
        <CheckinCard key={item.id} item={item} mine={item.username === me.username} onDelete={remove} />
      ))}
      {next && (
        <button
          type="button"
          className="button secondary"
          disabled={loadingMore}
          onClick={async () => {
            setLoadingMore(true);
            await load(next).catch((err) => setError(errorText(err)));
            setLoadingMore(false);
          }}
        >
          {loadingMore ? "Loading…" : t("feed.older")}
        </button>
      )}
    </div>
  );
}
