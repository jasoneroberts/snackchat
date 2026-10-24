import { useState } from "react";
import { api, errorText, type Me } from "../api";
import { Avatar } from "../components/Avatar";
import { DemoData } from "../components/DemoData";
import { Link } from "../components/Link";
import { VoiceChoice } from "../components/VoiceChoice";
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
          <Avatar username={me.username} avatarId={me.avatarPendingId ?? me.avatarId} size={96} />
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
            {(me.avatarId || me.avatarPendingId) && (
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
        {me.avatarPendingId ? (
          <p className="small notice">
            Waiting for approval. {me.avatarId ? "Everyone else sees your old picture" : "Everyone else sees your initials"} until then.
          </p>
        ) : (
          <p className="small muted">We crop it to a square from the middle of the photo. New pictures are checked before others see them.</p>
        )}
        {busy && <p className="small muted">Saving…</p>}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card-plain stack-sm">
        <div>
          <h2 className="section-title">Lad mode or grown-up mode</h2>
          <p className="small muted no-margin">Changes the words and colours only. Your snacks, points and boards stay the same.</p>
        </div>
        <VoiceChoice current={me.voice} onSaved={onChanged} />
      </section>

      <Link href="/welcome" className="card-plain row settings-link">
        <b className="grow">Add to home screen</b>
        <span className="muted small">And how Snackchat works</span>
      </Link>

      {me.isAdmin && (
        <>
          <h2 className="section-title admin-heading">Admin</h2>
          <Link href="/review" className="card-plain row settings-link">
            <b className="grow">Photo approvals</b>
            {me.reviewCount > 0 ? <span className="count-badge">{me.reviewCount}</span> : <span className="muted small">All clear</span>}
          </Link>
          <Link href="/admin/snacks" className="card-plain row settings-link">
            <b className="grow">Snacks</b>
            {me.pendingSnacks > 0 ? (
              <span className="count-badge">{me.pendingSnacks}</span>
            ) : (
              <span className="muted small">Fix names, makers and photos</span>
            )}
          </Link>
          <Link href="/admin/users" className="card-plain row settings-link">
            <b className="grow">Users</b>
            <span className="muted small">Who's joined, PIN resets</span>
          </Link>
          <Link href="/brands" className="card-plain row settings-link">
            <b className="grow">Brand logos</b>
            <span className="muted small">Shown when a snack has no photo</span>
          </Link>
          <DemoData onChanged={() => void onChanged()} />
        </>
      )}
    </div>
  );
}
