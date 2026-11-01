import { useEffect, useRef, useState } from "react";
import { drawCrisp, drawGame } from "../game/draw";
import { WORLD_H, newGame, resize, score, start, step, type CrashCause, type Game } from "../game/wingIt";
import { bestScore, recordScore } from "../lib/goldenCrisp";
import { markBadgesSeen } from "../lib/badgesSeen";
import { api } from "../api";
import { line } from "../../shared/voice";
import { WINGIT_BADGES } from "../../shared/achievements";

import { useVoice } from "../lib/voice";

// What to say when the run ends, in each voice. Kept here rather than in
// shared/voice.ts because nothing else in the app uses them.
const ENDINGS: Record<"grownup" | "lad", Record<CrashCause, string[]>> = {
  grownup: {
    bar: ["Landed on the bar.", "Touchdown, sadly."],
    pint: ["Splashed by a pint.", "Straight into the bitter."],
    hand: ["Snatched by a hand.", "Someone fancied a nibble."],
  },
  lad: {
    bar: ["Face down on the bar, mate.", "Binned it."],
    pint: ["Drowned in a pint. Legend.", "Swimming in the lager, lad."],
    hand: ["Some lad's had you!", "Pinched off the table, brutal."],
  },
};

interface Result {
  score: number;
  best: number;
  newBest: boolean;
  line: string;
  /** Score badges this round earned, filled in when the server answers. */
  badges?: string[];
}

/**
 * Wing It, full screen. The rules live in game/wingIt.ts and the art in
 * game/draw.ts; this component just runs the loop:
 *   every animation frame → step the game by the time since the last frame →
 *   draw it → and only tell React when the score or state changes, so the
 *   page doesn't re-render 60 times a second.
 */
export function CrispGame({ onClose, banner }: { onClose: () => void; banner?: string | null }) {
  const { voice } = useVoice();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const holding = useRef(false);
  const [phase, setPhase] = useState<Game["state"]>("ready");
  const [shown, setShown] = useState(0); // score on screen
  const [best, setBest] = useState(bestScore);
  const [result, setResult] = useState<Result | null>(null);
  // The buttons after a crash wake up a moment later, so a finger still
  // hammering the screen doesn't hit "Back to Crunchd" by accident.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!result) return setArmed(false);
    const timer = setTimeout(() => setArmed(true), 700);
    return () => clearTimeout(timer);
  }, [result]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let scale = 1;

    // Fit the canvas to the screen. The world is always WORLD_H tall, so a
    // taller phone just shows the same game bigger, and a wider one sees further ahead.
    const fit = () => {
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      scale = cssH / WORLD_H;
      const worldW = cssW / scale;
      if (!gameRef.current) gameRef.current = newGame(worldW);
      else resize(gameRef.current, worldW);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    };
    fit();
    // Local testing only (npm run dev): lets a script peek at the game.
    if (import.meta.env.DEV) (window as unknown as { wingIt?: typeof gameRef }).wingIt = gameRef;
    const watcher = new ResizeObserver(fit);
    watcher.observe(canvas);

    let frame = 0;
    let lastTime = performance.now();
    let lastState: Game["state"] = "ready";
    let lastScore = 0;
    const tick = (now: number) => {
      const g = gameRef.current!;
      step(g, (now - lastTime) / 1000, holding.current);
      lastTime = now;
      drawGame(ctx, g, holding.current);

      const s = score(g);
      if (s !== lastScore) setShown((lastScore = s));
      if (g.state !== lastState) {
        lastState = g.state;
        setPhase(g.state);
        if (g.state === "over") {
          holding.current = false;
          navigator.vibrate?.(60);
          const newBest = recordScore(s);
          const b = bestScore();
          setBest(b);
          const lines = ENDINGS[voice === "lad" ? "lad" : "grownup"][g.cause ?? "bar"];
          setResult({ score: s, best: b, newBest, line: lines[Math.floor(Math.random() * lines.length)] });
          // Score badges: send the best on this phone, so earlier high scores count too.
          if (b >= WINGIT_BADGES[0].goal) api<{ newBadges: { id: string; name: string }[] }>("/achievements/wingit", { body: { score: b } })
            .then((r) => {
              if (!r.newBadges.length) return;
              markBadgesSeen(r.newBadges.map((x) => x.id)); // announced here, so no popup as well
              setResult((prev) => prev && { ...prev, badges: r.newBadges.map((x) => x.name) });
            })
            .catch(() => {});
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // Phone locked or app switched: forget the gap so we don't jump ahead.
    const onShow = () => {
      lastTime = performance.now();
      holding.current = false;
    };
    document.addEventListener("visibilitychange", onShow);

    return () => {
      cancelAnimationFrame(frame);
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [voice]);

  // Keyboard too (space or up arrow), for anyone on a laptop. Escape closes.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== " " && e.key !== "ArrowUp") return;
      e.preventDefault();
      press();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp") holding.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onClose]);

  // Stop the page behind from scrolling while the game is open.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => void (document.body.style.overflow = before);
  }, []);

  const press = () => {
    const g = gameRef.current;
    if (!g || g.state === "over") return; // after a crash, only the buttons restart
    if (g.state === "ready") start(g);
    holding.current = true;
  };
  const release = () => void (holding.current = false);

  const again = () => {
    const g = gameRef.current!;
    gameRef.current = newGame(g.w);
    setResult(null);
    setShown(0);
    setPhase("ready");
  };

  return (
    <div className="wingit" role="dialog" aria-modal="true" aria-label="Wing It, the Golden Crisp game">
      <canvas
        ref={canvasRef}
        className="wingit-canvas"
        onPointerDown={(e) => {
          e.preventDefault();
          press();
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="wingit-hud">
        <span className="wingit-score" aria-live="polite">{shown}</span>
        <span className="wingit-best">Best {Math.max(best, shown)}</span>
        <button type="button" className="wingit-close" aria-label="Close the game" onClick={onClose}>
          ×
        </button>
      </div>

      {phase === "ready" && (
        <div className="wingit-card wingit-intro">
          <CrispBadge />
          {banner && <p className="wingit-banner">{banner}</p>}
          <h2>Wing It</h2>
          <p>
            <b>Hold</b> to flap up, <b>let go</b> to glide.
            <br />
            Over the pints, under the grabby hands, munch the crumbs.
          </p>
          <p className="wingit-hint">{voice === "lad" ? "Touch the screen to send it" : "Touch to take off"}</p>
        </div>
      )}

      {phase === "over" && result && (
        <div className={armed ? "wingit-card" : "wingit-card waking"}>
          <p className="wingit-line">{result.line}</p>
          <p className="wingit-final">{result.score}</p>
          <p className="wingit-sub">{result.newBest ? "New best!" : `Best ${result.best}`}</p>
          {result.badges?.map((name) => (
            <p key={name} className="wingit-sub wingit-badge">
              {line(voice, "badges.newNamed", { vars: { name } })}
            </p>
          ))}
          <div className="wingit-actions">
            <button type="button" className="button" onClick={again}>
              Fly again
            </button>
            <button type="button" className="button secondary wingit-back" onClick={onClose}>
              Back to Crunchd
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The winged crisp on its own, flapping, for the intro card and the flyby. */
export function CrispBadge({ size = 96 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    // Draw at 2x the crisp's natural size, centred.
    // The crisp with its wings spans about 60 x 52 units around its centre.
    const k = size / 66;
    let frame = 0;
    const tick = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
      drawCrisp(ctx, size / (2 * k) + 5, size / (2 * k) + 8, now / 1000, { flapRate: 12, glow: true, tilt: -0.12 });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [size]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden="true" />;
}
