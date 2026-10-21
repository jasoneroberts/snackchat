import { useState } from "react";
import { api, type Me } from "../api";
import { Link } from "../components/Link";

export function Home({ me }: { me: Me | null | undefined }) {
  const verifiedParam = new URLSearchParams(window.location.search).get("verified");
  const [resent, setResent] = useState(false);

  if (me === undefined) return <p className="muted">Loading…</p>;

  if (!me) {
    return (
      <section className="hero">
        <h1>Rate every snack. Beat your mates.</h1>
        <p>
          Log crisps, pub snacks, sweets and everything in between. Rate the crunch, the spice and the flavour, and
          climb your group's leaderboard.
        </p>
        <div className="actions">
          <Link href="/signup" className="button">
            Join with an invite code
          </Link>
          <Link href="/login">I already have an account</Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      {verifiedParam === "1" && <p className="notice good">Email confirmed. You're all set.</p>}
      {verifiedParam === "0" && <p className="notice bad">That confirmation link has expired or was already used.</p>}
      {!me.emailVerified && (
        <div className="notice">
          <p>Check your inbox and click the link to confirm your email. You can't post check-ins until you do.</p>
          <button
            className="link-button"
            disabled={resent}
            onClick={async () => {
              await api("/auth/resend-verification", { method: "POST" });
              setResent(true);
            }}
          >
            {resent ? "Sent again" : "Send the link again"}
          </button>
        </div>
      )}
      <h1>Hi @{me.username}</h1>
      <p className="muted">Snack check-ins, groups and leaderboards are coming next.</p>
    </section>
  );
}
