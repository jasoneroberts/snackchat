import { useEffect, useState } from "react";
import { CATEGORIES, getCategory } from "../../shared/catalogue";
import type { BoardPeriod, GroupCard, PeopleMetric, PeopleRow, SnackRow } from "../../shared/types";
import { api, errorText, type Me } from "../api";
import { Avatar } from "../components/Avatar";
import { Link } from "../components/Link";
import { SnackTile } from "../components/SnackTile";
import { rating } from "../lib/format";

type Kind = "people" | "snacks";

const PERIODS: { id: BoardPeriod; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
];

const METRICS: { id: PeopleMetric; label: string; unit: string }[] = [
  { id: "points", label: "Points", unit: "pts" },
  { id: "checkins", label: "Most check-ins", unit: "check-ins" },
  { id: "snacks", label: "Unique snacks", unit: "snacks" },
];

// Remember the last view on this device, so the tab opens where you left it.
const SAVED = "snackchat.boards";
interface View {
  kind: Kind;
  scope: string;
  period: BoardPeriod;
  metric: PeopleMetric;
  category: string;
}
const DEFAULT_VIEW: View = { kind: "people", scope: "global", period: "week", metric: "points", category: "" };

function loadView(): View {
  try {
    return { ...DEFAULT_VIEW, ...JSON.parse(localStorage.getItem(SAVED) ?? "{}") };
  } catch {
    return DEFAULT_VIEW;
  }
}

export function Boards({ me }: { me: Me }) {
  const [view, setView] = useState<View>(loadView);
  const [groups, setGroups] = useState<GroupCard[]>([]);
  const [people, setPeople] = useState<PeopleRow[] | null>(null);
  const [snacks, setSnacks] = useState<SnackRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (change: Partial<View>) => {
    const next = { ...view, ...change };
    setView(next);
    try {
      localStorage.setItem(SAVED, JSON.stringify(next));
    } catch {
      // Storage blocked: the board still works, it just won't be remembered.
    }
  };

  useEffect(() => {
    api<{ groups: GroupCard[] }>("/groups")
      .then((r) => {
        setGroups(r.groups);
        // A remembered group you've since left falls back to Everyone.
        if (view.scope !== "global" && !r.groups.some((g) => g.id === view.scope)) update({ scope: "global" });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setError(null);
    const q = `scope=${encodeURIComponent(view.scope)}&period=${view.period}`;
    if (view.kind === "people") {
      setPeople(null);
      api<{ rows: PeopleRow[] }>(`/boards/people?${q}&metric=${view.metric}`)
        .then((r) => setPeople(r.rows))
        .catch((err) => setError(errorText(err)));
    } else {
      setSnacks(null);
      api<{ rows: SnackRow[] }>(`/boards/snacks?${q}&category=${view.category}`)
        .then((r) => setSnacks(r.rows))
        .catch((err) => setError(errorText(err)));
    }
  }, [view.kind, view.scope, view.period, view.metric, view.category]);

  const scopeName = view.scope === "global" ? "Everyone" : groups.find((g) => g.id === view.scope)?.name ?? "Group";
  const periodName = PERIODS.find((p) => p.id === view.period)!.label.toLowerCase();
  const metric = METRICS.find((m) => m.id === view.metric)!;

  return (
    <div className="page stack">
      <div className="segmented dark">
        {(["people", "snacks"] as Kind[]).map((k) => (
          <button key={k} type="button" className={view.kind === k ? "on" : ""} aria-pressed={view.kind === k} onClick={() => update({ kind: k })}>
            {k === "people" ? "People" : "Snacks"}
          </button>
        ))}
      </div>

      <div className="chip-scroll">
        <button type="button" className={view.scope === "global" ? "pill on" : "pill"} onClick={() => update({ scope: "global" })}>
          Everyone
        </button>
        {groups.map((g) => (
          <button key={g.id} type="button" className={view.scope === g.id ? "pill on" : "pill"} onClick={() => update({ scope: g.id })}>
            {g.name}
          </button>
        ))}
      </div>

      <div className="segmented">
        {PERIODS.map((p) => (
          <button key={p.id} type="button" className={view.period === p.id ? "on" : ""} aria-pressed={view.period === p.id} onClick={() => update({ period: p.id })}>
            {p.label}
          </button>
        ))}
      </div>

      {view.kind === "people" ? (
        <div className="row wrap">
          {METRICS.map((m) => (
            <button key={m.id} type="button" className={view.metric === m.id ? "pill on" : "pill"} onClick={() => update({ metric: m.id })}>
              {m.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="chip-scroll">
          <button type="button" className={view.category === "" ? "pill on" : "pill"} onClick={() => update({ category: "" })}>
            All snacks
          </button>
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" className={view.category === c.id ? "pill on" : "pill"} onClick={() => update({ category: c.id })}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <p className="small muted no-margin">
        {view.kind === "people"
          ? `${scopeName}, ${periodName}, ranked by ${metric.label.toLowerCase()}.`
          : `Top-rated ${view.category ? getCategory(view.category)!.short : "snacks"}, ${scopeName.toLowerCase() === "everyone" ? "everyone's" : `${scopeName}'s`} ratings ${periodName}. Snacks with more ratings rank higher on a tie.`}
      </p>

      {error && <p className="error">{error}</p>}
      {view.kind === "people" && <PeopleBoard rows={people} me={me} unit={metric.unit} />}
      {view.kind === "snacks" && <SnackBoard rows={snacks} />}
    </div>
  );
}

const PODIUM_COLOURS = ["#F7C68E", "#E6E1D8", "#E9C2A0"]; // gold, silver, bronze
const PODIUM_HEIGHTS = [120, 92, 72];

function PeopleBoard({ rows, me, unit }: { rows: PeopleRow[] | null; me: Me; unit: string }) {
  if (!rows) return <p className="muted">Loading…</p>;
  if (rows.every((r) => r.checkins === 0)) {
    return (
      <div className="empty">
        <p className="muted">No check-ins yet for this board.</p>
        <Link href="/checkin" className="button">
          Check in a snack
        </Link>
      </div>
    );
  }

  const podium = rows.filter((r) => r.rank <= 3).slice(0, 3);
  // Silver on the left, gold in the middle, bronze on the right.
  const order = [podium[1], podium[0], podium[2]].filter(Boolean);
  const rest = rows.slice(podium.length);

  return (
    <>
      <div className="podium">
        {order.map((p) => {
          const place = podium.indexOf(p);
          return (
            <Link key={p.username} href={`/u/${p.username}`} className="podium-spot plain">
              <Avatar username={p.username} size={52} />
              <span className="podium-name">@{p.username}</span>
              <span className="podium-block" style={{ height: PODIUM_HEIGHTS[place], background: PODIUM_COLOURS[place] }}>
                <b className="podium-rank">{p.rank}</b>
                <span className="small">
                  {p.value} {unit}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
      {rest.length > 0 && (
        <ol className="board card-plain flush">
          {rest.map((r) => (
            <li key={r.username} className={r.username === me.username ? "me" : undefined}>
              <span className="board-rank">{r.rank}</span>
              <Link href={`/u/${r.username}`} className="plain row grow">
                <Avatar username={r.username} size={34} />
                <span className="grow">
                  <b>@{r.username}</b>
                  {r.username === me.username && <span className="muted"> (you)</span>}
                  <span className="small muted block">
                    {r.checkins} check-in{r.checkins === 1 ? "" : "s"} · {r.snacks} snack{r.snacks === 1 ? "" : "s"}
                  </span>
                </span>
              </Link>
              <b>
                {r.value} <span className="small muted">{unit}</span>
              </b>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

const MEDALS = ["#E0A526", "#A8A29A", "#B87333"];

function SnackBoard({ rows }: { rows: SnackRow[] | null }) {
  if (!rows) return <p className="muted">Loading…</p>;
  if (rows.length === 0) {
    return (
      <div className="empty">
        <p className="muted">No rated snacks here yet.</p>
        <Link href="/checkin" className="button">
          Rate one now
        </Link>
      </div>
    );
  }
  return (
    <div className="stack-sm">
      {rows.map((r) => (
        <Link key={r.snack.id} href={`/snack/${r.snack.id}`} className="list-card">
          <span className="board-rank">{r.rank}</span>
          <span className="medal-ring" style={{ borderColor: MEDALS[r.rank - 1] ?? "transparent" }}>
            <SnackTile snack={r.snack} size={48} />
          </span>
          <span className="grow">
            <b className="block">{r.snack.name}</b>
            <span className="small muted">
              {[r.snack.brand, getCategory(r.snack.category)?.short].filter(Boolean).join(" · ")} · {r.count} rating
              {r.count === 1 ? "" : "s"}
            </span>
          </span>
          <span className="rank-box">
            <b>{rating(Number(r.avg.toFixed(2)))}</b>
            <span className="small muted">avg</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
