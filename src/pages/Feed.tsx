import { useEffect, useState } from "react";
import type { FeedItem, JoinedItem } from "../../shared/types";
import { api, errorText, type Me } from "../api";
import { CheckinCard } from "../components/CheckinCard";
import { Link } from "../components/Link";
import { ChampionsCard } from "../components/ChampionsCard";
import { useVoice } from "../lib/voice";
import { YourWeekCard } from "../components/YourWeekCard";
import { JoinedLine } from "../components/JoinedLine";
import { mixFeed } from "../lib/feedMix";

export function Feed({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [joins, setJoins] = useState<JoinedItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const { t } = useVoice();

  const load = async (before?: string) => {
    const page = await api<{ items: FeedItem[]; joins?: JoinedItem[]; next: string | null }>(
      `/checkins${before ? `?before=${encodeURIComponent(before)}` : ""}`,
    );
    setItems((prev) => (before && prev ? [...prev, ...page.items] : page.items));
    setJoins((prev) => (before ? [...prev, ...(page.joins ?? [])] : page.joins ?? []));
    setNext(page.next);
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

  if (error) return <p className="error page">{error}</p>;
  if (!items) return <p className="muted page">Loading…</p>;

  return (
    <div className="page stack">
      <ChampionsCard />
      <YourWeekCard />
      {items.length === 0 && (
        <div className="empty">
          <h2>{t("feed.emptyTitle")}</h2>
          <p className="muted">{t("feed.emptyBody")}</p>
          <Link href="/checkin" className="button">
            {t("feed.emptyButton")}
          </Link>
        </div>
      )}
      {/* Check-ins and "joined Crunchd" lines together, newest first. */}
      {mixFeed(items, joins).map((entry) =>
        entry.kind === "checkin" ? (
          <CheckinCard key={entry.item.id} item={entry.item} mine={entry.item.username === me.username} onDelete={remove} />
        ) : (
          <JoinedLine key={`joined:${entry.item.username}`} item={entry.item} mine={entry.item.username === me.username} />
        ),
      )}
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
