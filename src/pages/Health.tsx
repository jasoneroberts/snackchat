import { useEffect, useState } from "react";
import { describeAdminAction } from "../../shared/audit";
import type { ErrorRow, HealthSummary } from "../../shared/types";
import { api, errorText } from "../api";
import { timeAgo } from "../lib/format";

type Tab = "errors" | "audit" | "backups";

/**
 * Admin page: is the app OK? Recent crashes (from phones and the server),
 * what admins have changed, and the nightly database backups.
 */
export function Health() {
  const [data, setData] = useState<HealthSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("errors");
  const [busy, setBusy] = useState(false);
  const [crash, setCrash] = useState(false);

  const load = () =>
    api<HealthSummary>("/admin/health")
      .then(setData)
      .catch((err) => setError(errorText(err)));

  useEffect(() => {
    load();
  }, []);

  // The "Test crash screen" button: throwing while drawing shows the crash page.
  if (crash) throw new Error("Test crash from Settings > Health");
  if (error && !data) return <p className="error page">{error}</p>;
  if (!data) return <p className="muted page">Loading…</p>;

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const status =
    data.errorsLastHour >= data.alertThreshold ? "bad" : data.errorsLastDay > 0 ? "" : "good";

  return (
    <div className="page stack">
      <div className="stat-row">
        <div className="stat card-plain">
          <b>{data.errorsLastHour}</b>
          <span className="small muted">errors this hour</span>
        </div>
        <div className="stat card-plain">
          <b>{data.errorsLastDay}</b>
          <span className="small muted">errors today</span>
        </div>
        <div className="stat card-plain">
          <b>{data.backups.length}</b>
          <span className="small muted">{data.backups.length === 1 ? "backup" : "backups"}</span>
        </div>
      </div>
      <div className={`notice ${status}`}>
        <p className="small">
          {data.errorsLastHour >= data.alertThreshold
            ? "Lots of errors right now."
            : data.errorsLastDay
              ? "A few errors today. Worth a look."
              : "No errors in the last day."}{" "}
          {data.alertsTo.length
            ? `${data.alertThreshold}+ errors in an hour emails ${data.alertsTo.join(", ")}.`
            : `${data.alertThreshold}+ errors in an hour would send an alert, but there's no email address to send it to yet.`}
        </p>
        {data.emailMode === "log" && (
          <p className="small no-margin muted">
            Email isn't set up yet, so alerts only go to the Worker logs for now.
          </p>
        )}
      </div>

      <div className="chip-scroll">
        {(
          [
            ["errors", "Errors"],
            ["audit", "Admin changes"],
            ["backups", "Backups"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button key={key} type="button" className={tab === key ? "pill on" : "pill"} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}

      {tab === "errors" && (
        <>
          {data.errors.length === 0 ? (
            <p className="muted">No errors. Nice.</p>
          ) : (
            <section className="card-plain">
              {data.errors.map((e) => (
                <ErrorItem key={e.id} e={e} />
              ))}
            </section>
          )}
          <div className="row">
            <button type="button" className="link-button small" onClick={() => setCrash(true)}>
              Test crash screen
            </button>
            <span className="grow" />
            {data.errors.length > 0 && (
              <button
                type="button"
                className="button secondary small"
                disabled={busy}
                onClick={() => confirm("Clear every error from the list?") && run(() => api("/admin/health/errors", { method: "DELETE" }))}
              >
                Clear list
              </button>
            )}
          </div>
        </>
      )}

      {tab === "audit" &&
        (data.audit.length === 0 ? (
          <p className="muted">No admin changes yet.</p>
        ) : (
          <section className="card-plain">
            {data.audit.map((a) => (
              <div key={a.id} className="health-item">
                <b>{describeAdminAction(a.method, a.path, a.detail)}</b>
                {a.status >= 400 && <span className="tag">failed</span>}
                <span className="small muted block">
                  @{a.adminName} · {timeAgo(a.createdAt)}
                </span>
              </div>
            ))}
          </section>
        ))}

      {tab === "backups" && (
        <>
          <p className="small muted no-margin">
            The whole database is copied every night at 3am (UTC) and the last 14 are kept. Photos are stored separately and
            aren't in these files. Download one now and then to keep a copy off Cloudflare.
          </p>
          {data.backups.length === 0 ? (
            <p className="muted">No backups yet. The first one runs tonight, or make one now.</p>
          ) : (
            <section className="card-plain">
              {data.backups.map((b) => (
                <div key={b.name} className="health-item row">
                  <span className="grow">
                    <b>{b.name.replace(".json", "")}</b>
                    <span className="small muted block">
                      {Math.max(1, Math.round(b.bytes / 1024))} KB · {timeAgo(b.createdAt)}
                    </span>
                  </span>
                  <a className="button secondary small" href={`/api/admin/health/backups/${b.name}`} download>
                    Download
                  </a>
                </div>
              ))}
            </section>
          )}
          <button type="button" className="button small" disabled={busy} onClick={() => run(() => api("/admin/health/backups", { body: {} }))}>
            {busy ? "Backing up…" : "Back up now"}
          </button>
        </>
      )}
    </div>
  );
}

function ErrorItem({ e }: { e: ErrorRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="health-item">
      <button type="button" className="admin-snack-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="grow">
          <b className="break">{e.message}</b>
          <span className="tag">{e.source === "client" ? "phone" : "server"}</span>
          <span className="small muted block">
            {e.username ? `@${e.username}` : "signed out"} · {e.path ?? "?"} · {timeAgo(e.createdAt)}
          </span>
        </span>
        <span className="chevron" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <pre className="error-detail">
          {e.detail ?? "No more detail."}
          {e.userAgent ? `\n\n${e.userAgent}` : ""}
        </pre>
      )}
    </div>
  );
}
