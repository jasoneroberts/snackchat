import { useEffect, useState } from "react";
import { api, errorText, type Me } from "../api";
import { Avatar } from "../components/Avatar";
import { DemoData } from "../components/DemoData";
import { Link } from "../components/Link";
import { navigate } from "../router";
import { VoiceChoice } from "../components/VoiceChoice";
import { YourData } from "../components/YourData";
import { Cropper } from "../components/Cropper";
import { AVATAR_SIDE } from "../lib/image";
import { pushState, turnOffPush, turnOnPush, type PushState } from "../lib/push";
import { REMIND_AFTER_DAYS } from "../../shared/reminders";
import { bestScore, foundGoldenCrisp, playWingIt, releaseGoldenCrisp } from "../lib/goldenCrisp";

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

  // A picked photo opens the cropper (square only); "Use photo" uploads the square.
  const [picked, setPicked] = useState<File | null>(null);
  const upload = (square: Blob) => {
    setPicked(null);
    void run(async () => {
      const body = new FormData();
      body.append("photo", square, "avatar.jpg");
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
                  onChange={(e) => {
                    setPicked(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                Take photo
              </label>
              <label className={`button secondary ${busy ? "disabled" : ""}`}>
                <input
                  type="file"
                  accept="image/*"
                  className="visually-hidden"
                  disabled={busy}
                  onChange={(e) => {
                    setPicked(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
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
          <p className="small muted">You can crop it to a square before it's saved. New pictures are checked before others see them.</p>
        )}
        {busy && <p className="small muted">Saving…</p>}
        {error && <p className="error">{error}</p>}
      </section>

      {picked && (
        <Cropper file={picked} squareOnly maxSide={AVATAR_SIDE} onDone={upload} onCancel={() => setPicked(null)} />
      )}

      <section className="card-plain stack-sm">
        <div>
          <h2 className="section-title">Lad mode or grown-up mode</h2>
          <p className="small muted no-margin">Changes the words and colours only. Your snacks, points and boards stay the same.</p>
        </div>
        <VoiceChoice current={me.voice} onSaved={onChanged} />
      </section>

      <Notifications me={me} onChanged={onChanged} />

      <Link href="/welcome" className="card-plain row settings-link">
        <b className="grow">Add to home screen</b>
        <span className="muted small">And how Crunchd works</span>
      </Link>

      <Link href="/snacks" className="card-plain row settings-link">
        <b className="grow">All snacks</b>
        <span className="muted small">Suggest a fix to a name or photo</span>
      </Link>

      {/* The hidden game: only listed once you've caught the Golden Crisp (admins always see it). */}
      {(foundGoldenCrisp() || me.isAdmin) && (
        <button type="button" className="card-plain row settings-link wingit-link" onClick={playWingIt}>
          <b className="grow">Wing It</b>
          <span className="muted small">{bestScore() > 0 ? `Your best: ${bestScore()}` : "The Golden Crisp game"}</span>
        </button>
      )}

      <YourData />

      {me.isAdmin && (
        <>
          <h2 className="section-title admin-heading">Admin</h2>
          <button
            type="button"
            className="card-plain row settings-link wingit-link"
            onClick={() => {
              navigate("/");
              setTimeout(() => releaseGoldenCrisp(), 600);
            }}
          >
            <b className="grow">Release the Golden Crisp</b>
            <span className="muted small">See it fly over the feed (test)</span>
          </button>
          <Link href="/review" className="card-plain row settings-link">
            <b className="grow">Photo approvals</b>
            {me.reviewCount > 0 ? <span className="count-badge">{me.reviewCount}</span> : <span className="muted small">All clear</span>}
          </Link>
          <Link href="/admin/reports" className="card-plain row settings-link">
            <b className="grow">Reports and requests</b>
            {me.openReports > 0 ? <span className="count-badge">{me.openReports}</span> : <span className="muted small">All clear</span>}
          </Link>
          <Link href="/admin/snacks" className="card-plain row settings-link">
            <b className="grow">Snacks</b>
            {me.pendingSnacks > 0 ? (
              <span className="count-badge">{me.pendingSnacks}</span>
            ) : (
              <span className="muted small">Fix names, makers and photos</span>
            )}
          </Link>
          <Link href="/admin/diet" className="card-plain row settings-link">
            <b className="grow">Diet check</b>
            <span className="muted small">Vegan and gluten-free labels</span>
          </Link>
          <Link href="/admin/users" className="card-plain row settings-link">
            <b className="grow">Users</b>
            {me.newUsers > 0 ? (
              <span className="count-badge" title="New since you last looked">{me.newUsers}</span>
            ) : (
              <span className="muted small">Who's joined, PIN resets</span>
            )}
          </Link>
          <Link href="/admin/stats" className="card-plain row settings-link">
            <b className="grow">Stats</b>
            <span className="muted small">Who comes back, what gets used</span>
          </Link>
          <Link href="/admin/health" className="card-plain row settings-link">
            <b className="grow">Health</b>
            <span className="muted small">Errors, admin changes, backups</span>
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

/**
 * Push notifications on this phone. Everyone can have check-in reminders
 * and "someone liked your check-in" messages;
 * admins also hear about new people, photos to approve, reports and new
 * snacks. Each phone is turned on separately; reminders and likes are each
 * one switch for the account.
 */
function Notifications({ me, onChanged }: { me: Me; onChanged: () => Promise<void> }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    pushState().then(setState, () => setState("unsupported"));
  }, []);

  const run = async (job: () => Promise<PushState | void>, done?: string) => {
    setBusy(true);
    setNote(null);
    try {
      const next = await job();
      if (next) setState(next);
      if (done) setNote(done);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "That didn't work. Try again.");
    }
    setBusy(false);
  };

  const sendTest = () =>
    run(async () => {
      const { sent } = await api<{ sent: number }>("/push/test", { method: "POST" });
      if (!sent) throw new Error("The test didn't go through. Turn notifications off and on again.");
    }, "Test sent. It should pop up in a few seconds.");

  return (
    <section className="card-plain stack-sm">
      <div className="row-between">
        <b>Notifications on this phone</b>
        {state === "on" && <span className="small accent">On</span>}
      </div>
      <p className="small muted no-margin">
        Hear when someone likes your check-in or welcomes you, and get a nudge if you go {REMIND_AFTER_DAYS} days without one
        {me.isAdmin ? ", plus new people, photos to approve, reports and new snacks as they happen." : "."}
      </p>
      {state === "needs-install" && (
        <p className="small no-margin">
          On iPhone, add Crunchd to your home screen first (<Link href="/welcome">how</Link>), open it from there, then turn this on.
        </p>
      )}
      {state === "unsupported" && <p className="small no-margin">This browser can't do notifications.</p>}
      {state === "blocked" && (
        <p className="small no-margin">Notifications are blocked for Crunchd. Allow them in your phone's settings, then come back here.</p>
      )}
      {state === "off" && (
        <button type="button" className="button" disabled={busy} onClick={() => run(turnOnPush, "Done. Notifications are on for this phone.")}>
          {busy ? "Turning on…" : "Turn on notifications"}
        </button>
      )}
      {state === "on" && (
        <div className="row">
          <button type="button" className="button secondary small" disabled={busy} onClick={sendTest}>
            Send a test
          </button>
          <button type="button" className="link-button" disabled={busy} onClick={() => run(turnOffPush, "Turned off on this phone.")}>
            Turn off
          </button>
        </div>
      )}
      {state === "on" && (
        <label className="radio-row">
          <input
            type="checkbox"
            checked={me.reminders}
            disabled={busy}
            onChange={(e) => {
              const on = e.target.checked;
              void run(async () => {
                await api("/push/reminders", { method: "PUT", body: { on } });
                await onChanged();
              }, on ? "Reminders on." : "Reminders off.");
            }}
          />
          Remind me to check in
        </label>
      )}
      {state === "on" && (
        <label className="radio-row">
          <input
            type="checkbox"
            checked={me.likeAlerts}
            disabled={busy}
            onChange={(e) => {
              const on = e.target.checked;
              void run(async () => {
                await api("/push/likes", { method: "PUT", body: { on } });
                await onChanged();
              }, on ? "Like messages on." : "Like messages off.");
            }}
          />
          Tell me when someone likes my check-in or welcomes me
        </label>
      )}
      {state === "on" && (
        <label className="radio-row">
          <input
            type="checkbox"
            checked={me.squadAlerts}
            disabled={busy}
            onChange={(e) => {
              const on = e.target.checked;
              void run(async () => {
                await api("/push/squads", { method: "PUT", body: { on } });
                await onChanged();
              }, on ? "Squad messages on." : "Squad messages off.");
            }}
          />
          Tell me when someone in my squads checks in
        </label>
      )}
      {note && <p className="small muted no-margin">{note}</p>}
    </section>
  );
}
