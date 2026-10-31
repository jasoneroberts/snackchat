import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { signupInviter, signupRef } from "../lib/ref";
import { Link } from "../components/Link";
import { Turnstile } from "../components/Turnstile";

export function SignUp({ onSignedIn }: { onSignedIn: () => void }) {
  const inviteFromLink = new URLSearchParams(window.location.search).get("invite") ?? "";
  const [form, setForm] = useState({ username: "", email: "", password: "", inviteCode: inviteFromLink });
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [field]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/auth/signup", { body: { ...form, turnstileToken: token, ref: signupRef(), invitedBy: signupInviter() } });
      onSignedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      // A Turnstile token works once, so get a fresh one for the next try.
      setToken(null);
      setAttempt((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h1>Join Crunchd</h1>
      <label>
        Invite code
        <input value={form.inviteCode} onChange={update("inviteCode")} required autoComplete="off" />
      </label>
      <label>
        Username
        <input value={form.username} onChange={update("username")} required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+" autoComplete="username" />
      </label>
      <label>
        Email
        <input type="email" value={form.email} onChange={update("email")} required autoComplete="email" />
      </label>
      <label>
        Password <span className="muted">(10 characters or more)</span>
        <input type="password" value={form.password} onChange={update("password")} required minLength={10} autoComplete="new-password" />
      </label>
      <Turnstile key={attempt} onToken={setToken} />
      {error && <p className="error">{error}</p>}
      <button className="button" disabled={busy || !token}>
        {busy ? "Creating your account…" : "Create account"}
      </button>
      <p className="small muted no-margin">
        By joining you agree to the <Link href="/terms">terms</Link> and <Link href="/privacy">privacy policy</Link>.
      </p>
      <p className="muted">
        Already joined? <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}
