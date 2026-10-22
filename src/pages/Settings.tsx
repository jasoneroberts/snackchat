import { useState } from "react";
import { api, errorText, type Me } from "../api";
import { Avatar } from "../components/Avatar";
import { squareAvatar } from "../lib/image";

export function Settings({ me, onChanged }: { me: Me; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const upload = (file: File | undefined) => {
    if (!file) return;
    void run(async () => {
      const body = new FormData();
      body.append("photo", await squareAvatar(file), "avatar.jpg");
      await api("/avatars", { body });
    });
  };

  return (
    <div className="page stack">
      <section className="card-plain stack">
        <h2 className="section-title">Profile picture</h2>
        <div className="avatar-edit">
          <Avatar username={me.username} avatarId={me.avatarId} size={96} />
          <div className="stack-sm">
            <div className="photo-buttons">
              {/* capture="user" opens the front camera on phones, for a selfie. */}
              <label className={`button ${busy ? "disabled" : ""}`}>
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="visually-hidden"
                  disabled={busy}
                  onChange={(e) => upload(e.target.files?.[0])}
                />
                Take photo
              </label>
              <label className={`button secondary ${busy ? "disabled" : ""}`}>
                <input
                  type="file"
                  accept="image/*"
                  className="visually-hidden"
                  disabled={busy}
                  onChange={(e) => upload(e.target.files?.[0])}
                />
                Choose photo
              </label>
            </div>
            {me.avatarId && (
              <button
                type="button"
                className="link-button small delete"
                disabled={busy}
                onClick={() => void run(() => api("/avatars", { method: "DELETE" }))}
              >
                Remove picture
              </button>
            )}
          </div>
        </div>
        <p className="small muted">We crop it to a square from the middle of the photo.</p>
        {busy && <p className="small muted">Saving…</p>}
        {error && <p className="error">{error}</p>}
      </section>
    </div>
  );
}
