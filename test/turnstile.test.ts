import { describe, expect, it } from "vitest";
import { TEST_SECRET, turnstileInTestMode, verifyTurnstile } from "../worker/lib/turnstile";

describe("turnstile", () => {
  it("is in test mode with no secret or the public test secret", () => {
    expect(turnstileInTestMode(undefined)).toBe(true);
    expect(turnstileInTestMode(TEST_SECRET)).toBe(true);
    expect(turnstileInTestMode("0x4AAAAAAA-real-secret")).toBe(false);
  });

  it("rejects a missing token without calling Cloudflare", async () => {
    expect(await verifyTurnstile(undefined, "", null)).toBe(false);
    expect(await verifyTurnstile(undefined, undefined, null)).toBe(false);
  });
});
