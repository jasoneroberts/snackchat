import { useCallback, useState, type FormEvent } from "react";
import { Link } from "../components/Link";
import { Turnstile } from "../components/Turnstile";
import { api, ApiError } from "../api";
import { signupInviter, signupRef } from "../lib/ref";

/**
 * Sign in with a name and a PIN. A new name makes an account (once the bot
 * check has passed); after that, the same name and PIN get you back in.
 */
export function QuickSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [token, setToken] = useState<string | null>(null);
  // Remounting the bot check gets a fresh token after a failed try (each token works once).
  const [attempt, setAttempt] = useState(0);
  const onToken = useCallback((t: string | null) => setToken(t), []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviter] = useState(signupInviter);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/auth/quick", { body: { username, pin, turnstileToken: token ?? "", ref: signupRef(), invitedBy: signupInviter() } });
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
      <h1>Jump in</h1>
      <p className="muted">New here? Pick a name and a PIN. Been before? Use the same ones to get back in, on any phone.</p>
      {inviter && <p className="invited-by">{inviter} invited you. Join and check in your first snack to say thanks.</p>}
      <label>
        Name
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/ /g, "_"))}
          required
          autoComplete="username"
          autoCapitalize="none"
          placeholder="e.g. sam_k"
        />
      </label>
      <label>
        PIN (4 to 8 digits)
        <input
          type="password"
          inputMode="numeric"
          pattern="\d{4,8}"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
          autoComplete="current-password"
        />
      </label>
      <Turnstile key={attempt} onToken={onToken} />
      {error && <p className="error">{error}</p>}
      <button className="button" disabled={busy}>
        {busy ? "Signing in…" : "Let's go"}
      </button>
      <p className="small muted no-margin">
        By joining you agree to the <Link href="/terms">terms</Link> and <Link href="/privacy">privacy policy</Link>.
      </p>
    </form>
  );
}
