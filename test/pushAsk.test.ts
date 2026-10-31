import { beforeEach, describe, expect, it } from "vitest";

// A pretend localStorage, since unit tests run in plain Node.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const { shouldAskForPush, snoozePushAsk } = await import("../src/lib/pushAsk");

const DAY = 86_400_000;

describe("when to ask about notifications", () => {
  beforeEach(() => store.clear());

  it("asks straight away when one tap can turn them on", () => {
    expect(shouldAskForPush("off", 0)).toBe(true);
  });

  it("never asks when a tap can't help, or they're already on", () => {
    for (const state of ["on", "blocked", "needs-install", "unsupported"] as const) {
      expect(shouldAskForPush(state, 0)).toBe(false);
    }
  });

  it("backs off after each 'Not now': 2 days, then a week, then stops", () => {
    snoozePushAsk(0);
    expect(shouldAskForPush("off", 1 * DAY)).toBe(false);
    expect(shouldAskForPush("off", 2 * DAY)).toBe(true);

    snoozePushAsk(2 * DAY);
    expect(shouldAskForPush("off", 8 * DAY)).toBe(false);
    expect(shouldAskForPush("off", 9 * DAY)).toBe(true);

    snoozePushAsk(9 * DAY);
    expect(shouldAskForPush("off", 1000 * DAY)).toBe(false);
  });

  it("leaves it alone if they turned notifications off in Settings", () => {
    store.set("crunchd.pushOff", "1");
    expect(shouldAskForPush("off", 0)).toBe(false);
  });
});
