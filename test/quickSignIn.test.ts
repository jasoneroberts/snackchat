import { describe, expect, it } from "vitest";
import { placeholderEmail, quickSignInOn, validateQuickSignIn } from "../worker/lib/quickSignIn";

describe("validateQuickSignIn", () => {
  it("accepts a name and a 4 to 8 digit PIN, invite code optional", () => {
    expect(validateQuickSignIn({ username: " sam_k ", pin: "1234" })).toEqual({
      ok: true,
      value: { username: "sam_k", pin: "1234", inviteCode: "" },
    });
    expect(validateQuickSignIn({ username: "sam_k", pin: "12345678", inviteCode: " JASE " })).toMatchObject({
      ok: true,
      value: { inviteCode: "JASE" },
    });
  });

  it("rejects bad names and PINs", () => {
    expect(validateQuickSignIn({ username: "s", pin: "1234" }).ok).toBe(false);
    expect(validateQuickSignIn({ username: "sam k", pin: "1234" }).ok).toBe(false);
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
