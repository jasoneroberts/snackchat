import { describe, expect, it } from "vitest";
import { validateSignUp } from "../worker/lib/validation";

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
