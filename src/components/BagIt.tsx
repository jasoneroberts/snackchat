import { useState } from "react";
import { BAG_POINTS } from "../../shared/bag";
import type { FeedItem } from "../../shared/types";
import { api, errorText } from "../api";
import { useVoice } from "../lib/voice";

/**
 * "Bag it" under someone else's check-in: saves the snack to your bagged list
 * (Explore's "Saved" list) and remembers whose check-in put you onto it. When
 * you then check it in for the first time, they get a tip (worker/lib/bagTips.ts).
 *
 * Like the heart, the screen changes first and switches back if the server
 * says no. Hidden once you've tried the snack, since there's nothing to bag.
 */
export function BagIt({ item }: { item: FeedItem }) {
  const { t } = useVoice();
  const about = { category: item.snack.category };
  const [bagged, setBagged] = useState(item.bagged);
  const [busy, setBusy] = useState(false);
  // The "they'll get points" note shows only straight after you bag it here.
  const [justBagged, setJustBagged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (item.tried || item.snack.status !== "approved") return null;

  const toggle = async () => {
    if (busy) return;
    const next = !bagged;
    setBusy(true);
    setError(null);
    setBagged(next);
    setJustBagged(next);
    try {
      await api(`/checkins/${encodeURIComponent(item.id)}/bag`, { method: next ? "PUT" : "DELETE" });
    } catch (err) {
      setBagged(!next);
      setJustBagged(false);
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={bagged ? "bag-button on" : "bag-button"}
        aria-pressed={bagged}
        onClick={toggle}
        title={bagged ? "Tap to take it off your list" : undefined}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 8h12l-1 12H7L6 8z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </svg>
        {bagged ? t("explore.saved", about) : t("explore.save", about)}
      </button>
      {justBagged && (
        <p className="bag-note small muted">
          {t("bag.hint", { ...about, vars: { name: item.username, pts: BAG_POINTS.tried } })}
        </p>
      )}
      {error && <p className="bag-note small error">{error}</p>}
    </>
  );
}

/** On your own check-in: how many people bagged the snack from it, and how many tried it. */
export function BagCount({ item }: { item: FeedItem }) {
  const { t } = useVoice();
  if (item.bags <= 0 && item.tries <= 0) return null;
  const about = { category: item.snack.category };
  return (
    <span className="small muted bag-count">
      🛍️ {t("bag.count", { ...about, vars: { n: Math.max(item.bags, item.tries) } })}
      {item.tries > 0 && ` · ${t("bag.tried", { ...about, vars: { n: item.tries } })}`}
    </span>
  );
}
