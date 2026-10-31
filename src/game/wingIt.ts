// "Wing It": the hidden Golden Crisp game. This file is only the rules: where
// everything is, how it moves and what counts as a crash. It never touches the
// screen, so it can be unit tested in plain Node (test/wingIt.test.ts). The
// drawing lives in draw.ts and the React wrapper in components/CrispGame.tsx.
//
// How it plays (our own design, not a copy of any game):
//  - HOLD anywhere to flap upward, LET GO to glide down. It's steady thrust,
//    not one-tap jumps, so it feels like steering a crisp on a draught.
//  - Pint glasses stand on the bar. Fly over them.
//  - Grabby hands reach down from above as they come in. Fly under them.
//  - Crumbs are 1 point each, and every obstacle you get past is 1 more.
//  - A rare pinch of salt "salts" the crisp: it shrugs off the next hit.
//  - Touching the bar ends the run. The ceiling is just a soft bump.
//  - It speeds up the longer you last.
//
// Units: the world is always WORLD_H units tall and as wide as the screen's
// shape needs (a phone held upright is about 300 wide). Time is in seconds.

export const WORLD_H = 640;
export const FLOOR_Y = 570; // top of the bar counter
export const CRISP_X_SHARE = 0.27; // crisp sits this far across the screen
export const CRISP_R = 17; // the crisp is treated as a circle this big for crashes

const GRAVITY = 1150; // pulling down, units per second per second
const THRUST = 2450; // pushing up while held (so net upward is THRUST - GRAVITY)
const MAX_RISE = 430;
const MAX_FALL = 540;
const START_SPEED = 165; // how fast the world slides left
const TOP_SPEED = 330;
const SPEED_UP = 4.2; // extra speed per second survived
const GAP_START = 300; // distance between obstacles at the start
const GAP_MIN = 215; // ...and once it's flat out
const SAFE_GAP = 140; // the hole a crisp always has between a hand and the bar
const GRACE = 1.2; // seconds of flashing after the salt saves you

export type Kind = "pint" | "hand";
export type CrashCause = "bar" | Kind;

export interface Obstacle {
  kind: Kind;
  x: number; // left edge
  w: number;
  /** pint: y of the top of the foam. hand: how far down the fingertips reach when fully out. */
  y: number;
  /** hand only: how far it has reached so far, 0 (hidden) to 1 (fully down). */
  reach: number;
  passed: boolean;
}

export interface Pickup {
  kind: "crumb" | "salt";
  x: number;
  y: number;
  taken: boolean;
  spin: number; // just for drawing: each crumb tumbles a little differently
}

export interface Floater {
  text: string;
  x: number;
  y: number;
  age: number;
}

export interface Game {
  state: "ready" | "playing" | "over";
  w: number; // world width
  t: number; // seconds since the run started
  y: number; // crisp's centre
  vy: number;
  speed: number;
  distance: number; // how far the world has slid, for parallax
  nextGap: number; // distance until the next obstacle is placed
  obstacles: Obstacle[];
  pickups: Pickup[];
  floaters: Floater[];
  crumbs: number;
  passed: number;
  salted: boolean;
  grace: number; // seconds left of "just got saved" flashing, when nothing can hurt you
  cause: CrashCause | null;
  /** Fully random by default; tests pass a fixed sequence. */
  rand: () => number;
}

export function newGame(w: number, rand: () => number = Math.random): Game {
  return {
    state: "ready",
    w,
    t: 0,
    y: WORLD_H * 0.42,
    vy: 0,
    speed: START_SPEED,
    distance: 0,
    nextGap: w * 0.75, // a moment to get the feel before the first pint
    obstacles: [],
    pickups: [],
    floaters: [],
    crumbs: 0,
    passed: 0,
    salted: false,
    grace: 0,
    cause: null,
    rand,
  };
}

export const score = (g: Game) => g.crumbs + g.passed;
export const crispX = (g: Game) => g.w * CRISP_X_SHARE;

/** Change the world's width (phone turned sideways) without restarting. */
export function resize(g: Game, w: number) {
  g.w = w;
}

/** Move the world on by dt seconds. `holding` is whether a finger is down. */
export function step(g: Game, dt: number, holding: boolean): void {
  // A long pause (tab hidden, phone locked) shouldn't teleport the crisp into a pint.
  dt = Math.min(dt, 1 / 20);
  g.floaters = g.floaters.filter((f) => (f.age += dt) < 0.8);
  if (g.state === "ready") {
    // Bob gently on the spot until the first touch.
    g.t += dt;
    g.y = WORLD_H * 0.42 + Math.sin(g.t * 3) * 10;
    return;
  }
  if (g.state === "over") {
    // Let the crisp drop to the bar after a crash, for a bit of drama.
    if (g.y < FLOOR_Y - CRISP_R) {
      g.vy = Math.min(g.vy + GRAVITY * dt, MAX_FALL);
      g.y = Math.min(g.y + g.vy * dt, FLOOR_Y - CRISP_R);
    }
    return;
  }

  g.t += dt;
  g.speed = Math.min(TOP_SPEED, START_SPEED + g.t * SPEED_UP);
  const dx = g.speed * dt;
  g.distance += dx;
  if (g.grace > 0) g.grace = Math.max(0, g.grace - dt);

  // The crisp: thrust while held, gravity always.
  g.vy += (GRAVITY - (holding ? THRUST : 0)) * dt;
  g.vy = Math.max(-MAX_RISE, Math.min(MAX_FALL, g.vy));
  g.y += g.vy * dt;
  if (g.y < CRISP_R) {
    g.y = CRISP_R; // bump the ceiling, no harm done
    g.vy = Math.max(0, g.vy);
  }

  // Slide everything left, and lower each hand as it comes on screen.
  for (const o of g.obstacles) {
    o.x -= dx;
    if (o.kind === "hand") {
      // Starts reaching as it enters, fully down by about 40% of the way across.
      const onScreen = (g.w - o.x) / (g.w * 0.6);
      o.reach = Math.max(o.reach, Math.min(1, Math.max(0, onScreen)));
    }
  }
  for (const p of g.pickups) p.x -= dx;
  g.obstacles = g.obstacles.filter((o) => o.x + o.w > -40);
  g.pickups = g.pickups.filter((p) => p.x > -40 && !p.taken);

  // Place new things just off the right edge.
  g.nextGap -= dx;
  if (g.nextGap <= 0) spawn(g);

  const cx = crispX(g);

  // Got past something? That's a point.
  for (const o of g.obstacles) {
    if (!o.passed && o.x + o.w < cx - CRISP_R) {
      o.passed = true;
      g.passed += 1;
      g.floaters.push({ text: "+1", x: cx, y: g.y - 30, age: 0 });
    }
  }

  // Munch anything we fly through.
  for (const p of g.pickups) {
    if (p.taken || Math.hypot(p.x - cx, p.y - g.y) > CRISP_R + (p.kind === "salt" ? 16 : 11)) continue;
    p.taken = true;
    if (p.kind === "crumb") {
      g.crumbs += 1;
    } else {
      g.salted = true;
      g.floaters.push({ text: "Salted!", x: cx, y: g.y - 34, age: 0 });
    }
  }

  // Crashes.
  if (g.y + CRISP_R >= FLOOR_Y) {
    g.y = FLOOR_Y - CRISP_R; // the bar always ends it, salt or not
    return crash(g, "bar");
  }
  if (g.grace > 0) return;
  for (const o of g.obstacles) {
    if (!hits(o, cx, g.y)) continue;
    if (g.salted) {
      // The salt takes the hit: knock it off and give a moment to get clear.
      g.salted = false;
      g.grace = GRACE;
      g.floaters.push({ text: "Phew!", x: cx, y: g.y - 34, age: 0 });
      return;
    }
    return crash(g, o.kind);
  }
}

function crash(g: Game, cause: CrashCause) {
  g.state = "over";
  g.cause = cause;
  g.vy = Math.max(g.vy, 0);
}

/** Start the run (first touch on the ready screen). */
export function start(g: Game) {
  if (g.state !== "ready") return;
  g.state = "playing";
  g.t = 0;
  g.vy = -260; // a little hop so the first touch feels like take-off
}

/**
 * The parts of an obstacle a crisp can hit, as rectangles.
 * A pint is its glass (from the foam down to the bar). A hand is the arm coming
 * down from the top plus a slightly wider hand at the end.
 */
export function shapes(o: Obstacle): Array<{ x: number; y: number; w: number; h: number }> {
  if (o.kind === "pint") return [{ x: o.x, y: o.y, w: o.w, h: FLOOR_Y - o.y }];
  const tip = o.y * o.reach;
  const palm = 62;
  return [
    { x: o.x + o.w * 0.18, y: 0, w: o.w * 0.64, h: Math.max(0, tip - palm) }, // arm
    { x: o.x, y: Math.max(0, tip - palm), w: o.w, h: Math.min(palm, tip) }, // hand
  ];
}

export function hits(o: Obstacle, cx: number, cy: number): boolean {
  return shapes(o).some((r) => circleHitsRect(cx, cy, CRISP_R, r));
}

export function circleHitsRect(cx: number, cy: number, r: number, rect: { x: number; y: number; w: number; h: number }) {
  if (rect.w <= 0 || rect.h <= 0) return false;
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

/** Put the next obstacle just off screen, and a trail of crumbs in the gap before it. */
function spawn(g: Game) {
  const r = g.rand;
  const x = g.w + 20;
  const last = g.obstacles[g.obstacles.length - 1];
  // Hands only turn up once you've got going.
  const kind: Kind = score(g) >= 4 && r() < 0.42 ? "hand" : "pint";
  let o: Obstacle;
  if (kind === "pint") {
    let top = 280 + r() * 175; // foam somewhere between 280 and 455
    // Straight after a hand, keep the pint low enough that you can drop under the
    // hand and still climb over the pint in time.
    if (last?.kind === "hand") top = Math.max(top, last.y + 20);
    o = { kind, x, w: 60, y: top, reach: 0, passed: false };
  } else {
    let depth = 170 + r() * 170; // fingertips somewhere between 170 and 340
    depth = Math.min(depth, FLOOR_Y - SAFE_GAP - CRISP_R * 2);
    o = { kind, x, w: 66, y: depth, reach: 0, passed: false };
  }
  g.obstacles.push(o);

  // Crumbs (or, now and then, salt) in the clear air between the last obstacle and this one.
  const gapStart = last ? last.x + last.w : g.w * 0.5;
  const gapEnd = x;
  if (gapEnd - gapStart > 90) {
    const midX = (gapStart + gapEnd) / 2;
    const midY = 150 + r() * (FLOOR_Y - 260);
    if (!g.salted && score(g) >= 8 && r() < 0.1) {
      g.pickups.push({ kind: "salt", x: midX, y: midY, taken: false, spin: r() });
    } else {
      const n = 3 + Math.floor(r() * 3);
      const tilt = (r() - 0.5) * 1.2; // a gentle slope so you have to steer a bit
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 26;
        g.pickups.push({ kind: "crumb", x: midX + off, y: midY + off * tilt, taken: false, spin: r() });
      }
    }
  }

  // Gaps shrink as the speed climbs.
  const keen = (g.speed - START_SPEED) / (TOP_SPEED - START_SPEED);
  g.nextGap = GAP_START - (GAP_START - GAP_MIN) * keen + r() * 60 + o.w;
}
