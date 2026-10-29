import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { Link } from "../components/Link";
import { Turnstile } from "../components/Turnstile";

export function LogIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/auth/login", { body: { email, password, turnstileToken: token } });
      onSignedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setToken(null);
      setAttempt((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h1>Log in</h1>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      </label>
      <Turnstile key={attempt} onToken={setToken} />
      {error && <p className="error">{error}</p>}
      <button className="button" disabled={busy || !token}>
        {busy ? "Logging in…" : "Log in"}
      </button>
      <p className="muted">
        New here? <Link href="/signup">Join</Link>
      </p>
    </form>
  );
}
