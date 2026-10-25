import { useEffect, useState } from "react";
import { REPORT_REASONS, type ReportReason, type ReportTarget } from "../../shared/reports";
import { api, errorText } from "../api";

const WHAT: Record<ReportTarget, string> = { checkin: "check-in", user: "person", snack: "snack" };

/** A small "Report" link that opens a sheet asking why. */
export function ReportButton({ type, id, className }: { type: ReportTarget; id: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  if (sent) return <span className={`small muted ${className ?? ""}`}>Reported. Thanks.</span>;
  return (
    <>
      <button type="button" className={`link-button small ${className ?? ""}`} onClick={() => setOpen(true)}>
        Report
      </button>
      {open && (
        <ReportSheet
          type={type}
          id={id}
          onClose={() => setOpen(false)}
          onSent={() => {
            setOpen(false);
            setSent(true);
          }}
        />
      )}
    </>
  );
}

function ReportSheet({ type, id, onClose, onSent }: { type: ReportTarget; id: string; onClose: () => void; onSent: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/reports", { body: { targetType: type, targetId: id, reason, note } });
      onSent();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet stack-sm" role="dialog" aria-modal="true" aria-label={`Report this ${WHAT[type]}`} onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title">Report this {WHAT[type]}</h2>
        <p className="small muted no-margin">An admin will take a look. They won't tell anyone it was you.</p>
        <div className="stack-xs">
          {REPORT_REASONS.map((r) => (
            <label key={r.key} className="radio-row">
              <input type="radio" name="reason" checked={reason === r.key} onChange={() => setReason(r.key)} />
              {r.label}
            </label>
          ))}
        </div>
        <textarea placeholder="Anything else? (optional)" maxLength={300} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="button" className="button secondary grow" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button grow" disabled={!reason || busy} onClick={send}>
            {busy ? "Sending…" : "Send report"}
          </button>
        </div>
      </div>
    </div>
  );
}
