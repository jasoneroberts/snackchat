import { useEffect, useState } from "react";
import { reasonLabel } from "../../shared/reports";
import type { AdminReport } from "../../shared/types";
import { api, errorText } from "../api";
import { Avatar } from "../components/Avatar";
import { Link } from "../components/Link";
import { timeAgo } from "../lib/format";

type Action = { action: string; label: string; confirm?: string; danger?: boolean };

const ACTIONS: Record<AdminReport["targetType"], Action[]> = {
  checkin: [
    { action: "remove-text", label: "Remove review" },
    { action: "hide-photo", label: "Hide photo" },
    { action: "delete-checkin", label: "Delete check-in", confirm: "Delete this check-in and its points?", danger: true },
  ],
  user: [
    { action: "remove-avatar", label: "Remove picture" },
    {
      action: "delete-account",
      label: "Delete account",
      confirm: "Delete this account and everything in it? This can't be undone.",
      danger: true,
    },
  ],
  snack: [],
};

/**
 * Admin page: things people have reported. Look, then either take it down
 * (remove the review, hide the photo, and so on) or dismiss the report.
 */
export function AdminReports({ onChanged }: { onChanged: () => void }) {
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    api<{ reports: AdminReport[] }>("/admin/reports")
      .then((data) => setReports(data.reports))
      .catch((err) => setError(errorText(err)));

  useEffect(() => {
    load();
  }, []);

  const act = async (r: AdminReport, a: Action | { action: "dismiss"; confirm?: undefined }) => {
    if (a.confirm && !confirm(a.confirm)) return;
    const key = `${r.targetType}:${r.targetId}`;
    setBusy(key);
    setError(null);
    try {
      await api(`/admin/reports/${r.targetType}/${encodeURIComponent(r.targetId)}`, { body: { action: a.action } });
      setReports((list) => list?.filter((x) => `${x.targetType}:${x.targetId}` !== key) ?? null);
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  if (error && !reports) return <p className="error page">{error}</p>;
  if (!reports) return <p className="muted page">Loading…</p>;

  return (
    <div className="page stack">
      <p className="small muted no-margin">
        Things people have reported. Take it down, or dismiss the report if it's fine. Reporters stay anonymous to
        everyone but you.
      </p>
      {error && <p className="error">{error}</p>}
      {reports.length === 0 && <p className="muted">No reports. All quiet.</p>}
      {reports.map((r) => {
        const key = `${r.targetType}:${r.targetId}`;
        return (
          <section key={key} className="card-plain stack-sm">
            <Target r={r} />
            <ul className="report-list small">
              {r.reports.map((x, i) => (
                <li key={i}>
                  <b>{reasonLabel(x.reason)}</b> from @{x.reporter}, {timeAgo(x.createdAt)}
                  {x.note && <span className="block muted">“{x.note}”</span>}
                </li>
              ))}
            </ul>
            <div className="row wrap">
              {ACTIONS[r.targetType].map((a) => (
                <button
                  key={a.action}
                  type="button"
                  className={a.danger ? "button secondary small danger" : "button secondary small"}
                  disabled={busy !== null}
                  onClick={() => act(r, a)}
                >
                  {a.label}
                </button>
              ))}
              <button type="button" className="button small" disabled={busy !== null} onClick={() => act(r, { action: "dismiss" })}>
                {r.targetType === "snack" ? "Done" : "It's fine"}
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Target({ r }: { r: AdminReport }) {
  if (r.checkin) {
    const c = r.checkin;
    return (
      <div className="stack-xs">
        <div className="small muted">
          Check-in by <Link href={`/u/${encodeURIComponent(c.username)}`}>@{c.username}</Link> of <b>{c.snackName}</b>,{" "}
          {timeAgo(c.createdAt)}
        </div>
        {c.photoId && <img className="report-photo" src={`/api/photos/${c.photoId}`} alt="" loading="lazy" />}
        {c.review ? <p className="checkin-review no-margin">{c.review}</p> : <p className="small muted no-margin">No review.</p>}
        {(c.venue || c.pairedWith) && (
          <p className="small muted no-margin">{[c.venue && `At ${c.venue}`, c.pairedWith && `With ${c.pairedWith}`].filter(Boolean).join(" · ")}</p>
        )}
      </div>
    );
  }
  if (r.user) {
    const u = r.user;
    return (
      <Link href={`/u/${encodeURIComponent(u.username)}`} className="row saved-link">
        <Avatar username={u.username} avatarId={u.avatarId} size={44} />
        <span>
          <b>@{u.username}</b>
          {u.isAdmin && <span className="tag">admin</span>}
          <span className="small muted block">
            Joined {timeAgo(u.joinedAt)} · {u.checkins} check-ins
          </span>
        </span>
      </Link>
    );
  }
  if (r.snack) {
    const s = r.snack;
    return (
      <div className="small">
        Snack: <b>{s.name}</b> {s.brand && <span className="muted">by {s.brand}</span>}
        <span className="block muted">
          Fix its name, maker or photo in <Link href="/admin/snacks">Snacks</Link>, then tap Done.
        </span>
      </div>
    );
  }
  return <p className="small muted no-margin">This has already been deleted.</p>;
}
