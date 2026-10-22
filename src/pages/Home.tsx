import { useState } from "react";
import { api, type Me } from "../api";
import { Link } from "../components/Link";

/** The welcome page for people who aren't signed in. */
export function Home() {
  return (
    <section className="hero">
      <h1>Rate every snack. Beat your mates.</h1>
      <p>
        Log crisps, pub snacks, sweets and everything in between. Rate the crunch, the spice and the flavour, and climb
        your group's leaderboard.
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

/** Shown above every page until the email address is confirmed. */
export function VerifyNotice({ me }: { me: Me }) {
  const verifiedParam = new URLSearchParams(window.location.search).get("verified");
  const [resent, setResent] = useState(false);

  if (verifiedParam === "1") return <p className="notice good">Email confirmed. You're all set.</p>;
  if (verifiedParam === "0") return <p className="notice bad">That confirmation link has expired or was already used.</p>;
  if (me.emailVerified) return null;
  return (
    <div className="notice">
      <p>Check your inbox and click the link to confirm your email.</p>
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
  );
}
