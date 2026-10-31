import { useEffect, useState } from "react";
import { api } from "../api";
import { foundGoldenCrisp, markFound, onGoldenCrisp } from "../lib/goldenCrisp";
import { CrispBadge, CrispGame } from "./CrispGame";
import { track } from "../lib/track";

/**
 * Lives once at the top of the signed-in app (App.tsx). It waits for the
 * Golden Crisp to be released (see lib/goldenCrisp.ts), then flutters it across
 * the screen for a few seconds. Tap it in time and Wing It opens.
 */
export function GoldenCrisp() {
  // A new number each flight, so a second flight restarts the animation.
  const [flight, setFlight] = useState<{ id: number; top: number; flip: boolean } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(
    () =>
      onGoldenCrisp((e) => {
        if (e === "play") {
          setBanner(null);
          setPlaying(true);
          return;
        }
        // Somewhere in the middle band of the screen, left-to-right or right-to-left.
        setFlight({ id: Date.now(), top: 18 + Math.random() * 40, flip: Math.random() < 0.5 });
      }),
    [],
  );

  const catchIt = async () => {
    const first = !foundGoldenCrisp();
    markFound();
    setFlight(null);
    setBanner(first ? "You caught the Golden Crisp!" : "Caught it again!");
    setPlaying(true);
    track("wingit");
    if (!first) return;
    // The achievements feature gives a secret badge for this. Until that's
    // live the endpoint won't exist, and that's fine: the game works without it.
    try {
      const r = await api<{ new?: boolean; badge?: { name?: string } }>("/achievements/secret/golden_crisp", {
        method: "POST",
      });
      if (r.new) setBanner(`You caught the Golden Crisp! New badge: ${r.badge?.name ?? "Golden Crisp"}`);
    } catch {
      // No badge yet. Nothing to tell them.
    }
  };

  return (
    <>
      {flight && (
        <button
          key={flight.id}
          type="button"
          className={flight.flip ? "golden-crisp flip" : "golden-crisp"}
          style={{ top: `${flight.top}%` }}
          aria-label="A Golden Crisp! Tap it"
          onClick={catchIt}
          onAnimationEnd={() => setFlight(null)}
        >
          <span className="golden-crisp-bob">
            <CrispBadge size={84} />
          </span>
        </button>
      )}
      {playing && <CrispGame banner={banner} onClose={() => setPlaying(false)} />}
    </>
  );
}
