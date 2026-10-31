import { beforeEach, describe, expect, it } from "vitest";
import {
  CRISP_R,
  FLOOR_Y,
  circleHitsRect,
  crispX,
  newGame,
  score,
  start,
  step,
  type Game,
} from "../src/game/wingIt";

// A pretend localStorage, since unit tests run in plain Node.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
const gc = await import("../src/lib/goldenCrisp");

const run = (g: Game, seconds: number, holding: (g: Game) => boolean) => {
  for (let t = 0; t < seconds && g.state === "playing"; t += 1 / 60) step(g, 1 / 60, holding(g));
};

describe("Wing It rules", () => {
  it("waits on the ready screen until the first touch", () => {
    const g = newGame(300, () => 0.5);
    for (let i = 0; i < 120; i++) step(g, 1 / 60, false);
    expect(g.state).toBe("ready");
    expect(g.obstacles).toHaveLength(0);
  });

  it("ends the run when the crisp drops onto the bar", () => {
    const g = newGame(300, () => 0.5);
    start(g);
    run(g, 5, () => false);
    expect(g.state).toBe("over");
    expect(g.cause).toBe("bar");
    expect(g.y + CRISP_R).toBeLessThanOrEqual(FLOOR_Y);
  });

  it("only bumps the ceiling, it doesn't end the run", () => {
    const g = newGame(300, () => 0.5);
    start(g);
    run(g, 0.5, () => true);
    expect(g.state).toBe("playing");
    expect(g.y).toBeGreaterThanOrEqual(CRISP_R);
  });

  it("crashes into a pint in the way", () => {
    const g = newGame(300, () => 0.5);
    start(g);
    g.y = 500;
    g.obstacles.push({ kind: "pint", x: crispX(g) + 10, w: 60, y: 400, reach: 0, passed: false });
    step(g, 1 / 60, true);
    expect(g.state).toBe("over");
    expect(g.cause).toBe("pint");
  });

  it("salt takes one hit for you, then you flash for a moment", () => {
    const g = newGame(300, () => 0.5);
    start(g);
    g.salted = true;
    g.y = 500;
    g.obstacles.push({ kind: "pint", x: crispX(g) + 10, w: 60, y: 400, reach: 0, passed: false });
    step(g, 1 / 60, true);
    expect(g.state).toBe("playing");
    expect(g.salted).toBe(false);
    expect(g.grace).toBeGreaterThan(0);
  });

  it("a hand only hurts once it has reached down", () => {
    const g = newGame(300, () => 0.5);
    start(g);
    g.y = 100;
    // Off to the right, so it hasn't started reaching yet: the crisp is safe beside it.
    const hand = { kind: "hand" as const, x: 400, w: 66, y: 300, reach: 0, passed: false };
    g.obstacles.push(hand);
    step(g, 1 / 60, true);
    expect(g.state).toBe("playing");
    // Fully down and right on the crisp: caught.
    hand.x = crispX(g) - 20;
    hand.reach = 1;
    step(g, 1 / 60, true);
    expect(g.cause).toBe("hand");
  });

  it("scores crumbs and obstacles passed, and speeds up", () => {
    const g = newGame(300, () => 0.5);
    start(g);
    const startSpeed = g.speed;
    g.pickups.push({ kind: "crumb", x: crispX(g), y: g.y, taken: false, spin: 0 });
    g.obstacles.push({ kind: "pint", x: crispX(g) - 100, w: 60, y: 520, reach: 0, passed: false });
    step(g, 1 / 60, true);
    expect(g.crumbs).toBe(1);
    expect(g.passed).toBe(1);
    expect(score(g)).toBe(2);
    for (let i = 0; i < 300; i++) step(g, 1 / 60, g.y > 300); // hover in the middle
    expect(g.speed).toBeGreaterThan(startSpeed);
  });

  it("always leaves room to get under a hand", () => {
    // Even with the deepest possible reach, the gap down to the bar fits the crisp.
    // Alternate "low" and "high" rolls, so some spawns are hands with the deepest reach.
    let i = 0;
    const g = newGame(300, () => (i++ % 2 ? 0.999 : 0.1));
    start(g);
    g.crumbs = 10; // hands only appear once you've scored a few
    let deepest = 0;
    for (let n = 0; n < 2000; n++) {
      g.y = 200;
      g.vy = 0;
      g.grace = 1; // never crash, we're only looking at what gets placed
      step(g, 1 / 60, false);
      for (const o of g.obstacles) if (o.kind === "hand") deepest = Math.max(deepest, o.y);
    }
    expect(deepest).toBeGreaterThan(0);
    expect(FLOOR_Y - deepest).toBeGreaterThan(CRISP_R * 2 + 100);
  });

  it("works out circle-and-box overlaps", () => {
    const box = { x: 0, y: 0, w: 10, h: 10 };
    expect(circleHitsRect(5, 5, 1, box)).toBe(true);
    expect(circleHitsRect(14, 5, 5, box)).toBe(true);
    expect(circleHitsRect(16, 5, 5, box)).toBe(false);
    expect(circleHitsRect(5, 5, 3, { ...box, h: 0 })).toBe(false);
  });
});

describe("when the Golden Crisp flies", () => {
  beforeEach(() => store.clear());

  it("follows the odds: rarer after a like than a check-in", () => {
    expect(gc.shouldRelease("like", 1e12, 0.1)).toBe(true);
    expect(gc.shouldRelease("like", 1e12, 0.2)).toBe(false);
    expect(gc.shouldRelease("checkin", 1e12, 0.3)).toBe(true);
  });

  it("never flies twice within the cool-down", () => {
    const now = 1e12;
    expect(gc.maybeReleaseGoldenCrisp("like", now, 0)).toBe(true);
    expect(gc.maybeReleaseGoldenCrisp("like", now + 60_000, 0)).toBe(false);
    expect(gc.maybeReleaseGoldenCrisp("like", now + gc.COOLDOWN_MS, 0)).toBe(true);
  });

  it("tells the overlay to fly, and remembers being found and the best score", () => {
    const seen: string[] = [];
    const stop = gc.onGoldenCrisp((e) => seen.push(e));
    gc.releaseGoldenCrisp();
    gc.playWingIt();
    stop();
    gc.releaseGoldenCrisp();
    expect(seen).toEqual(["fly", "play"]);

    expect(gc.foundGoldenCrisp()).toBe(false);
    gc.markFound();
    expect(gc.foundGoldenCrisp()).toBe(true);
    expect(gc.recordScore(12)).toBe(true);
    expect(gc.recordScore(7)).toBe(false);
    expect(gc.bestScore()).toBe(12);
  });
});
