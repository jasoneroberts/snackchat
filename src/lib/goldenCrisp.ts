// The Golden Crisp: a rare winged crisp that flutters across the screen just
// after you like a check-in or post one. Tap it before it flies off and it
// opens the hidden game, Wing It (src/game/wingIt.ts).
//
// Everything here is remembered on this phone only (localStorage), like the
// notifications prompt. It's a bit of fun, so losing it in private browsing is fine.
//
// The pieces:
//  - maybeReleaseGoldenCrisp(reason): roll the dice after a like or check-in.
//  - onGoldenCrisp(listener): the <GoldenCrisp> overlay listens for "fly" and "play".
//  - playWingIt(): open the game straight away (Settings, once you've found it).

import { recall, remember } from "./pushAsk";

const KEY = "crunchd.goldenCrisp"; // {"last": ms it last flew, "found": true once caught, "best": top score}

/** Chance of the crisp appearing. A check-in is rarer than a like, so it's more generous. */
export const ODDS = { like: 1 / 6, checkin: 1 / 3 } as const;
/** Never twice within this long, so it stays a surprise. */
export const COOLDOWN_MS = 20 * 60_000;

export type Reason = keyof typeof ODDS;

interface Saved {
  last?: number;
  found?: boolean;
  best?: number;
}

function load(): Saved {
  try {
    return JSON.parse(recall(KEY) ?? "{}") as Saved;
  } catch {
    return {};
  }
}
function save(patch: Saved) {
  remember(KEY, JSON.stringify({ ...load(), ...patch }));
}

/** Should the crisp fly now? `roll` is a random number 0..1 (passed in so tests can pick it). */
export function shouldRelease(reason: Reason, now: number, roll: number): boolean {
  const { last = 0 } = load();
  if (now - last < COOLDOWN_MS) return false;
  return roll < ODDS[reason];
}

export const foundGoldenCrisp = () => load().found === true;
export const markFound = () => save({ found: true });
export const bestScore = () => load().best ?? 0;
/** Keep the higher of the old best and this score; true if it's a new best. */
export function recordScore(score: number): boolean {
  if (score <= bestScore()) return false;
  save({ best: score });
  return true;
}

// ---------------------------------------------------------------------------
// A tiny event bus, so a heart deep in the feed can tell the overlay at the top
// of the app to do something without passing callbacks through every page.

type Event = "fly" | "play";
const listeners = new Set<(e: Event) => void>();

export function onGoldenCrisp(listener: (e: Event) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
const emit = (e: Event) => listeners.forEach((l) => l(e));

/** After a like or check-in: maybe send the Golden Crisp across the screen. */
export function maybeReleaseGoldenCrisp(reason: Reason, now = Date.now(), roll = Math.random()) {
  if (!shouldRelease(reason, now, roll)) return false;
  releaseGoldenCrisp(now);
  return true;
}

/** Send it now, whatever the odds (also used by the admin "test" button). */
export function releaseGoldenCrisp(now = Date.now()) {
  save({ last: now });
  emit("fly");
}

/** Open the game without the chase (from Settings once it's been found). */
export const playWingIt = () => emit("play");
