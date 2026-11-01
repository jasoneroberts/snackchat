import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "../components/Link";
import { Turnstile } from "../components/Turnstile";
import { api, ApiError } from "../api";
import { signupInviter, signupRef } from "../lib/ref";

const WAIT_MS = 15_000;

// How to get back in. There's no email on these accounts yet, so a person
// resets it by hand (Admin > People > Reset PIN), after checking it's them.
const FORGOT_PIN =
  "Ask the person who invited you to message jase in the app with your name, and you'll get a new PIN. Jase may ask about your last few check-ins to make sure it's you.";

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

  // Every sign-in needs the bot check's token. It usually arrives a second
  // after the page opens, but someone whose phone fills in the name and PIN
  // can press the button sooner. Then we wait for it (up to WAIT_MS) instead
  // of sending a try that's bound to fail.
  const [waiting, setWaiting] = useState(false);
  const waitStarted = useRef(0);

  const send = async (turnstileToken: string) => {
    setWaiting(false);
    try {
      await api("/auth/quick", { body: { username, pin, turnstileToken, ref: signupRef(), invitedBy: signupInviter() } });
      onSignedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setToken(null);
      setAttempt((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    if (token) return void send(token);
    waitStarted.current = Date.now();
    setWaiting(true);
  };

  useEffect(() => {
    if (!waiting) return;
    if (token) return void send(token);
    // No token after WAIT_MS (the check couldn't load): send anyway, and the server says what's wrong.
    const timer = setTimeout(() => void send(""), Math.max(0, WAIT_MS - (Date.now() - waitStarted.current)));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- send reads the latest form values
  }, [waiting, token]);

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
        {waiting ? "Checking you're not a bot…" : busy ? "Signing in…" : "Let's go"}
      </button>
      <details className="small">
        <summary>Forgotten your PIN?</summary>
        <p className="muted">
          {FORGOT_PIN} Please don't make a new account: your check-ins, points and badges stay on the old one.
        </p>
      </details>
      <p className="small muted no-margin">
        By joining you agree to the <Link href="/terms">terms</Link> and <Link href="/privacy">privacy policy</Link>.
      </p>
    </form>
  );
}
