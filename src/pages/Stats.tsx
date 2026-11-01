import { useEffect, useState } from "react";
import { refLabel } from "../../shared/ref";
import type { StatsSummary } from "../../shared/types";
import { api, errorText } from "../api";
import { timeAgo } from "../lib/format";

/**
 * Admin page: is anyone using this, and what for? Who comes back each week,
 * which features get used, and where people came from. Everything is worked
 * out fresh on the server each time the page opens (worker/routes/stats.ts).
 */
export function Stats() {
  const [data, setData] = useState<StatsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<StatsSummary>("/admin/stats")
      .then(setData)
      .catch((err) => setError(errorText(err)));
  }, []);

  if (error) return <p className="error page">{error}</p>;
  if (!data) return <p className="muted page">Loading…</p>;

  const lastWeek = data.weeks[1];
  // Of last week's active people, how many have been back this week? The
  // simplest "are they sticking?" number there is.
  const stuck = lastWeek && lastWeek.active > 0 ? Math.round((data.keptFromLastWeek / lastWeek.active) * 100) : null;

  return (
    <div className="page stack">
      <div className="stat-row">
        <div className="stat card-plain">
          <b>{data.people}</b>
          <span className="small muted">people</span>
        </div>
        <div className="stat card-plain">
          <b>{data.activeThisWeek}</b>
          <span className="small muted">active this week</span>
        </div>
        <div className="stat card-plain">
          <b>{data.returningThisWeek}</b>
          <span className="small muted">came back</span>
        </div>
      </div>
      <p className="small muted no-margin">
        Active means they did something: checked in, liked, voted, used Hunt, joined a squad, added a snack
        {data.hasUsage ? " or just opened the app" : ""}. Came back means active this week and joined before it.
        {stuck !== null &&
          ` ${data.keptFromLastWeek} of last week's ${lastWeek.active} active ${lastWeek.active === 1 ? "person has" : "people have"} been back this week (${stuck}%).`} Weeks start on Monday.
      </p>
      {!data.hasUsage && (
        <div className="notice">
          <p className="small no-margin">
            App opens, Wing It games and shares aren't being counted yet. They start once the database update for this page is
            applied.
          </p>
        </div>
      )}

      <section className="card-plain stack-sm">
        <b>Week by week</b>
        <table className="sources">
          <thead>
            <tr>
              <th>Week of</th>
              <th>Joined</th>
              <th>Active</th>
              <th>Came back</th>
              <th>Check-ins</th>
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((w, i) => (
              <tr key={w.weekStart}>
                <td>{i === 0 ? "This week" : shortDate(w.weekStart)}</td>
                <td>{w.joined}</td>
                <td>{w.active}</td>
                <td>{w.returning}</td>
                <td>{w.checkins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card-plain stack-sm">
        <div>
          <b>What gets used</b>
          <span className="small muted block">How many times, and by how many people.</span>
        </div>
        <table className="sources">
          <thead>
            <tr>
              <th />
              <th>7 days</th>
              <th>30 days</th>
            </tr>
          </thead>
          <tbody>
            {data.features.map((f) => (
              <tr key={f.key} className={f.month === 0 ? "muted" : undefined}>
                <td>{f.label}</td>
                <td>{timesBy(f.week, f.weekPeople)}</td>
                <td>{timesBy(f.month, f.monthPeople)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <span className="small muted">
          {data.pushOn} {data.pushOn === 1 ? "person has" : "people have"} notifications turned on.
        </span>
      </section>

      <section className="card-plain stack-sm">
        <div>
          <b>Where people came from</b>
          <span className="small muted block">
            From the ref on the first link they opened, like getcrunchd.com/?ref=pub. "no link" means they came straight in (and
            everyone from before this was added).
          </span>
        </div>
        <table className="sources">
          <thead>
            <tr>
              <th>Link</th>
              <th>Joined</th>
              <th>Checked in</th>
              <th>Active now</th>
            </tr>
          </thead>
          <tbody>
            {data.sources.map((s) => (
              <tr key={s.ref ?? ""}>
                <td>{refLabel(s.ref)}</td>
                <td>{s.joined}</td>
                <td>{s.checkedIn}</td>
                <td>{s.activeThisWeek}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.inviters.length > 0 && (
          <>
            <b className="small">Personal invite links</b>
            <table className="sources">
              <thead>
                <tr>
                  <th>Invited by</th>
                  <th>Joined</th>
                  <th>Checked in</th>
                </tr>
              </thead>
              <tbody>
                {data.inviters.map((i) => (
                  <tr key={i.username}>
                    <td>{i.username}</td>
                    <td>{i.joined}</td>
                    <td>{i.checkedIn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="card-plain stack-sm">
        <div>
          <b>Everyone</b>
          <span className="small muted block">Most recently active first. Weeks counts the last {data.weeks.length} weeks.</span>
        </div>
        <table className="sources">
          <thead>
            <tr>
              <th>Name</th>
              <th>Last active</th>
              <th>Weeks</th>
              <th>Check-ins</th>
            </tr>
          </thead>
          <tbody>
            {data.everyone.map((p) => (
              <tr key={p.username}>
                <td>
                  {p.username}
                  {p.activeThisWeek && <span className="stats-dot" title="Active this week" />}
                  <span className="small muted block">
                    joined {timeAgo(p.joinedAt)}
                    {p.ref ? ` · ${p.ref}` : ""}
                  </span>
                </td>
                <td className="small">{p.lastActive ? dayAgo(p.lastActive) : "–"}</td>
                <td>{p.weeksActive}</td>
                <td>{p.checkins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/**
 * "today", "yesterday", "3 days ago". Whole days only, because app opens are
 * only stored by the day: "23h ago" would really mean "some time today".
 */
function dayAgo(seconds: number) {
  const days = Math.floor(Date.now() / 86400000) - Math.floor(seconds / 86400);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

/** "12 by 5", or "–" for nothing. */
const timesBy = (times: number, people: number) => (times === 0 ? "–" : `${times} by ${people}`);

/** "27 Oct" for a week's Monday. */
const shortDate = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
