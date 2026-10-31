import { describe, expect, it } from "vitest";
import { newPin, PIN_RE, placeholderEmail, quickSignInOn, validateQuickSignIn } from "../worker/lib/quickSignIn";

describe("validateQuickSignIn", () => {
  it("accepts a name and a 4 to 8 digit PIN, bot-check token optional", () => {
    expect(validateQuickSignIn({ username: " sam_k ", pin: "1234" })).toEqual({
      ok: true,
      value: { username: "sam_k", pin: "1234", turnstileToken: "", ref: null, inviter: null },
    });
    expect(validateQuickSignIn({ username: "sam_k", pin: "12345678", turnstileToken: "tok" })).toMatchObject({
      ok: true,
      value: { turnstileToken: "tok" },
    });
  });

  it("rejects bad names and PINs", () => {
    expect(validateQuickSignIn({ username: "s", pin: "1234" }).ok).toBe(false);
    expect(validateQuickSignIn({ username: "sam-k", pin: "1234" }).ok).toBe(false);
    // Spaces turn into underscores rather than being refused.
    expect(validateQuickSignIn({ username: "sam  dale", pin: "1234" })).toMatchObject({ ok: true, value: { username: "sam_dale" } });
    expect(validateQuickSignIn({ username: "sam", pin: "123" }).ok).toBe(false);
    expect(validateQuickSignIn({ username: "sam", pin: "123456789" }).ok).toBe(false);
    expect(validateQuickSignIn({ username: "sam", pin: "12a4" }).ok).toBe(false);
    expect(validateQuickSignIn(null).ok).toBe(false);
  });
});

describe("quickSignInOn", () => {
  it("is only on when the variable says so", () => {
    expect(quickSignInOn({ QUICK_SIGNIN: "on" })).toBe(true);
    expect(quickSignInOn({ QUICK_SIGNIN: "off" })).toBe(false);
    expect(quickSignInOn({})).toBe(false);
  });
});

it("makes a lowercase placeholder email", () => {
  expect(placeholderEmail("Sam_K")).toBe("sam_k@quick.snackchat.invalid");
});

describe("newPin", () => {
  it("makes 6-digit PINs that pass the PIN rule, keeping leading zeros", () => {
    const pins = Array.from({ length: 200 }, newPin);
    for (const pin of pins) {
      expect(pin).toMatch(/^\d{6}$/);
      expect(PIN_RE.test(pin)).toBe(true);
    }
    expect(new Set(pins).size).toBeGreaterThan(190);
  });
});
