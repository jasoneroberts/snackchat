import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";

/**
 * Sign in with a name and a PIN, for testing with friends. New names make an
 * account, which needs the invite code; after that, name and PIN are enough.
 */
export function QuickSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/auth/quick", { body: { username, pin, inviteCode } });
      onSignedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h1>Jump in</h1>
      <p className="muted">Pick a name and a PIN. Use the same ones to get back in on another phone.</p>
      <label>
        Name
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
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
      <label>
        Invite code <span className="muted small">(first time only)</span>
        <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} autoCapitalize="characters" />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="button" disabled={busy}>
        {busy ? "Signing in…" : "Let's go"}
      </button>
    </form>
  );
}
