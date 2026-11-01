import { beforeEach, describe, expect, it } from "vitest";

// A pretend localStorage, since unit tests run in plain Node.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const { shouldAskForPush, snoozePushAsk, markPushAsked, shouldShowBlockedHelp, markBlockedHelpShown, shouldAskAboutTypes, markTypesAsked } =
  await import("../src/lib/pushAsk");

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
    markPushAsked(); // the sheet does this on every answer, so the comeback ask is already used
    expect(shouldAskForPush("off", 1000 * DAY)).toBe(false);
  });

  it("leaves it alone if they turned notifications off in Settings and already had the one comeback ask", () => {
    store.set("crunchd.pushOff", "1");
    store.set("crunchd.pushAskedAgain", "1");
    expect(shouldAskForPush("off", 0)).toBe(false);
  });
});

describe("notifications on by default: asking people who have them off", () => {
  beforeEach(() => store.clear());

  it("asks once more after three 'Not now's, then stops for good", () => {
    snoozePushAsk(0);
    snoozePushAsk(2 * DAY);
    snoozePushAsk(9 * DAY);
    expect(shouldAskForPush("off", 10 * DAY)).toBe(true); // the one comeback ask
    snoozePushAsk(10 * DAY);
    markPushAsked();
    expect(shouldAskForPush("off", 1000 * DAY)).toBe(false);
  });

  it("asks once more if they turned it off in Settings, but only once", () => {
    store.set("crunchd.pushOff", "1");
    expect(shouldAskForPush("off", 0)).toBe(true);
    markPushAsked();
    expect(shouldAskForPush("off", 1000 * DAY)).toBe(false);
  });

  it("the comeback ask doesn't skip the normal back-off for new people", () => {
    snoozePushAsk(0);
    markPushAsked();
    expect(shouldAskForPush("off", 1 * DAY)).toBe(false);
    expect(shouldAskForPush("off", 2 * DAY)).toBe(true);
  });

  it("shows the 'blocked' how-to once", () => {
    expect(shouldShowBlockedHelp("off")).toBe(false);
    expect(shouldShowBlockedHelp("blocked")).toBe(true);
    markBlockedHelpShown();
    expect(shouldShowBlockedHelp("blocked")).toBe(false);
  });

  it("asks once about kinds switched off, only when the phone has notifications on", () => {
    expect(shouldAskAboutTypes("on", 0)).toBe(false);
    expect(shouldAskAboutTypes("off", 2)).toBe(false);
    expect(shouldAskAboutTypes("on", 2)).toBe(true);
    markTypesAsked();
    expect(shouldAskAboutTypes("on", 2)).toBe(false);
  });
});
