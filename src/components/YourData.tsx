import { useEffect, useState } from "react";
import { api, errorText } from "../api";
import { Avatar } from "./Avatar";
import { Link } from "./Link";

/** Settings: people you've blocked, your data, and the privacy policy and terms. */
export function YourData() {
  return (
    <>
      <Blocked />
      <section className="card-plain stack-sm">
        <h2 className="section-title">Your data</h2>
        <p className="small muted no-margin">
          Get a copy of everything Snackchat keeps about you, or delete your account. See the{" "}
          <Link href="/privacy">privacy policy</Link> and <Link href="/terms">terms</Link>.
        </p>
        <a className="button secondary small" href="/api/account/export" download>
          Download my data
        </a>
        <DeleteAccount />
      </section>
    </>
  );
}

function Blocked() {
  const [blocked, setBlocked] = useState<{ username: string; avatarId: string | null }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ blocked: { username: string; avatarId: string | null }[] }>("/blocks")
      .then((d) => setBlocked(d.blocked))
      .catch((err) => setError(errorText(err)));
  }, []);

  const unblock = async (username: string) => {
    try {
      await api(`/blocks/${encodeURIComponent(username)}`, { method: "DELETE" });
      setBlocked((list) => list?.filter((b) => b.username !== username) ?? null);
    } catch (err) {
      setError(errorText(err));
    }
  };

  // Only worth a section once someone's been blocked.
  if (!blocked?.length && !error) return null;
  return (
    <section className="card-plain stack-sm">
      <h2 className="section-title">Blocked</h2>
      <p className="small muted no-margin">You don't see each other's check-ins. They aren't told.</p>
      {error && <p className="error">{error}</p>}
      {blocked?.map((b) => (
        <div key={b.username} className="row">
          <Avatar username={b.username} avatarId={b.avatarId} size={32} />
          <b className="grow">@{b.username}</b>
          <button type="button" className="link-button small" onClick={() => unblock(b.username)}>
            Unblock
          </button>
        </div>
      ))}
    </section>
  );
}

function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" className="link-button small delete" onClick={() => setOpen(true)}>
        Delete my account
      </button>
    );
  }

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/account/delete", { body: { pin } });
      // Signed out now: start again from the front page.
      location.assign("/");
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <div className="notice bad stack-sm">
      <p>
        <b>This deletes your account for good.</b> Your check-ins, reviews, photos, points and group places go with it. Snacks
        you added stay, without your name. Groups you started pass to another member. It can't be undone.
      </p>
      <label className="field">
        <span className="field-label">Your PIN, to be sure it's you</span>
        <input type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" className="button secondary grow" onClick={() => setOpen(false)}>
          Keep my account
        </button>
        <button type="button" className="button grow danger-fill" disabled={!pin || busy} onClick={remove}>
          {busy ? "Deleting…" : "Delete for good"}
        </button>
      </div>
    </div>
  );
}
