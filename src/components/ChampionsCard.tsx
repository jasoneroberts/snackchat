import { useEffect, useState } from "react";
import type { Champions } from "../../shared/achievements";
import { api } from "../api";
import { rating } from "../lib/format";
import { useVoice } from "../lib/voice";
import { Avatar } from "./Avatar";
import { Link } from "./Link";
import { SnackTile } from "./SnackTile";

/** Monday on a UK clock, when the champions card shows. */
export function isUkMonday(date = new Date()): boolean {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" }).format(date) === "Mon";
}

/**
 * The card at the top of the feed on Mondays: last week's top snack on the
 * Table and the person with the most points. The rest of the week it isn't
 * shown at all, so the Table's live "This week" is the only race in town.
 */
export function ChampionsCard() {
  const { voice } = useVoice();
  const [data, setData] = useState<Champions | null>(null);
  const monday = isUkMonday();

  useEffect(() => {
    if (monday) api<Champions>("/champions").then(setData).catch(() => setData(null));
  }, [monday]);

  if (!monday || !data || (!data.snack && !data.person)) return null;
  return (
    <section className="card-plain stack-sm champions-card">
      <h2 className="section-title no-margin">{voice === "lad" ? "Last week's legends" : "Last week's champions"}</h2>
      {data.snack && (
        <Link href={`/snack/${encodeURIComponent(data.snack.id)}`} className="champion-row">
          <span className="champion-medal" aria-hidden="true">
            🏆
          </span>
          <SnackTile snack={data.snack} size={48} />
          <div className="grow">
            <div className="small muted">Top of the Table</div>
            <div className="big-text">{data.snack.name}</div>
            <div className="small muted">
              {rating(Number(data.snack.avg.toFixed(2)))} from {data.snack.count} {data.snack.count === 1 ? "rating" : "ratings"}
            </div>
          </div>
        </Link>
      )}
      {data.person && (
        <Link href={`/u/${encodeURIComponent(data.person.username)}`} className="champion-row">
          <span className="champion-medal" aria-hidden="true">
            👑
          </span>
          <Avatar username={data.person.username} avatarId={data.person.avatarId} size={48} />
          <div className="grow">
            <div className="small muted">{voice === "lad" ? "Top snacker" : "Most points"}</div>
            <div className="big-text">{data.person.username}</div>
            <div className="small muted">{data.person.points} pts</div>
          </div>
        </Link>
      )}
    </section>
  );
}
