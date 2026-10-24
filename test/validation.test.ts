import { describe, expect, it } from "vitest";
import { validateSignUp, validateSnackFields } from "../worker/lib/validation";

const good = { username: "crisp_king", email: "Jase@Example.com ", password: "longenough1", inviteCode: "BETA", turnstileToken: "t" };

describe("validateSignUp", () => {
  it("accepts a valid sign-up and normalises the email", () => {
    const result = validateSignUp(good);
    expect(result.ok && result.value.email).toBe("jase@example.com");
  });

  it.each([
    [{ username: "ab" }, "Usernames"],
    [{ username: "has space" }, "Usernames"],
    [{ email: "not-an-email" }, "email address"],
    [{ password: "short" }, "10 characters"],
    [{ inviteCode: "" }, "invite-only"],
  ])("rejects %o", (change, message) => {
    const result = validateSignUp({ ...good, ...change });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(message);
  });
});

describe("validateSnackFields", () => {
  const isCategory = (id: string) => id === "crisps";

  it("tidies spaces and turns a blank maker into null", () => {
    expect(validateSnackFields({ name: "  Prawn   Cocktail ", brand: "  ", category: "crisps" }, isCategory)).toEqual({
      ok: true,
      value: { name: "Prawn Cocktail", brand: null, category: "crisps" },
    });
    expect(validateSnackFields({ name: "Quavers", brand: " Walkers ", category: "crisps" }, isCategory)).toMatchObject({
      value: { brand: "Walkers" },
    });
  });

  it("refuses short names, long makers and unknown types", () => {
    expect(validateSnackFields({ name: "Q", category: "crisps" }, isCategory).ok).toBe(false);
    expect(validateSnackFields({ name: "Quavers", brand: "x".repeat(61), category: "crisps" }, isCategory).ok).toBe(false);
    expect(validateSnackFields({ name: "Quavers", category: "soup" }, isCategory)).toEqual({ ok: false, error: "Pick a snack type." });
    expect(validateSnackFields(null, isCategory).ok).toBe(false);
  });
});
