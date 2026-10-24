import { useEffect, useState } from "react";
import { attributesFor, getCategory } from "../../shared/catalogue";
import type { SnackPage } from "../../shared/types";
import { api, errorText, type Me } from "../api";
import { Bars } from "../components/Bars";
import { CheckinCard } from "../components/CheckinCard";
import { Link } from "../components/Link";
import { SnackTile } from "../components/SnackTile";
import { rating } from "../lib/format";

export function Snack({ id, me }: { id: string; me: Me }) {
  const [data, setData] = useState<SnackPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    api<SnackPage>(`/snacks/${encodeURIComponent(id)}`)
      .then(setData)
      .catch((err) => setError(errorText(err)));
  }, [id]);

  if (error) return <p className="error page">{error}</p>;
  if (!data) return <p className="muted page">Loading…</p>;

  const { snack } = data;
  const category = getCategory(snack.category);
  const photo = data.checkins.find((c) => c.photoId)?.photoId;

  return (
    <div className="page stack">
      <SnackTile snack={{ ...snack, photoId: snack.photoId ?? photo }} />
      <div>
        <h1 className="title">{snack.name}</h1>
        <div className="muted">
          {[snack.brand, category?.name, snack.country === "GB" ? "UK" : snack.country].filter(Boolean).join(" · ")}
          {snack.status === "pending" && <span className="tag">new, waiting for approval</span>}
        </div>
      </div>

      <div className="tiles three">
        <div className="tile">
          <b>{data.avg !== null ? rating(Number(data.avg.toFixed(2))) : "–"}</b>
          <span>Avg rating</span>
        </div>
        <div className="tile">
          <b>{data.count.toLocaleString("en-GB")}</b>
          <span>Check-ins</span>
        </div>
        <div className="tile">
          <b>{data.rank ? `#${data.rank.position}` : "–"}</b>
          <span>in {category?.short ?? "its type"}</span>
        </div>
      </div>

      {Object.keys(data.attributes).length > 0 && (
        <section className="card-plain">
          <h2 className="section-title">What it's like</h2>
          <Bars attributes={attributesFor(snack.category)} values={data.attributes} />
        </section>
      )}

      <Link href={`/checkin?snack=${encodeURIComponent(snack.id)}`} className="button big">
        Check in this snack
      </Link>

      <h2 className="section-title">Recent check-ins</h2>
      {data.checkins.length === 0 && <p className="muted">No one has checked this in yet.</p>}
      {data.checkins.map((item) => (
        <CheckinCard key={item.id} item={item} mine={item.username === me.username} />
      ))}
    </div>
  );
}
