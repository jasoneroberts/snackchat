import { useEffect, useMemo, useState } from "react";
import { getCategory } from "../../shared/catalogue";
import { filterFor, filterTypes, typeFilters } from "../../shared/typeFilters";
import type { TriedSnack } from "../../shared/types";
import { api, errorText } from "../api";
import { Link } from "../components/Link";
import { SnackTile } from "../components/SnackTile";
import { rating, timeAgo } from "../lib/format";
import { useViewState } from "../lib/viewState";
import { useVoice } from "../lib/voice";

type Sort = "recent" | "rating" | "times";
const SORTS: { id: Sort; label: string }[] = [
  { id: "recent", label: "Latest" },
  { id: "rating", label: "Top rated" },
  { id: "times", label: "Most often" },
];

/**
 * Every snack someone has checked in, once each, with their latest rating.
 * Reached from the Snacks number on a profile (/u/<name>/snacks).
 */
export function TriedSnacks({ username, isMe }: { username: string; isMe: boolean }) {
  const { voice } = useVoice();
  const [snacks, setSnacks] = useState<TriedSnack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useViewState("tried.category", "");
  const [sort, setSort] = useViewState<Sort>("tried.sort", "recent");
  const category = filterFor(voice, filter);

  useEffect(() => {
    setSnacks(null);
    api<{ snacks: TriedSnack[] }>(`/users/${encodeURIComponent(username)}/snacks`)
      .then((r) => setSnacks(r.snacks))
      .catch((err) => setError(errorText(err)));
  }, [username]);

  const shown = useMemo(() => {
    const types = filterTypes(category);
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = (snacks ?? []).filter((t) => {
      if (types && !types.includes(t.snack.category)) return false;
      const text = `${t.snack.name} ${t.snack.brand ?? ""}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
    // The list arrives newest first, so ties keep that order.
    if (sort === "rating") return [...list].sort((a, b) => b.latest - a.latest);
    if (sort === "times") return [...list].sort((a, b) => b.times - a.times);
    return list;
  }, [snacks, category, query, sort]);

  if (error) return <p className="error page">{error}</p>;
  if (!snacks) return <p className="muted page">Loading…</p>;

  if (snacks.length === 0) {
    return (
      <div className="page stack">
        <p className="muted">{isMe ? "You haven't checked in any snacks yet." : `${username} hasn't checked in any snacks yet.`}</p>
        {isMe && (
          <Link href="/checkin" className="button">
            Log your first snack
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="page stack">
      <input type="search" placeholder="Search snacks or makers" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chip-scroll">
        {typeFilters(voice).map((f) => (
          <button key={f.id} type="button" className={category === f.id ? "pill on" : "pill"} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="segmented small">
        {SORTS.map((s) => (
          <button key={s.id} type="button" className={sort === s.id ? "on" : ""} aria-pressed={sort === s.id} onClick={() => setSort(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="small muted no-margin">
        {shown.length} {shown.length === 1 ? "snack" : "snacks"}
      </p>
      <div className="stack-sm">
        {shown.map((t) => (
          <Link key={t.snack.id} href={`/snack/${t.snack.id}`} className="saved-row saved-link">
            <SnackTile snack={t.snack} size={44} />
            <span className="grow">
              <b className="block">{t.snack.name}</b>
              <span className="small muted">
                {[t.snack.brand, getCategory(t.snack.category)?.short].filter(Boolean).join(" · ")}
                {" · "}
                {t.times > 1 ? `${t.times} times, last ${timeAgo(t.lastAt)}` : timeAgo(t.lastAt)}
              </span>
            </span>
            <span className="tried-rating">
              <b>{rating(t.latest)}</b>
              <span className="small muted">★</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
