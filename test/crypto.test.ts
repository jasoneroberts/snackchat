import { describe, expect, it } from "vitest";
import { hashPassword, randomToken, sha256, verifyPassword } from "../worker/lib/crypto";

describe("passwords", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("pickled onion monster munch");
    expect(stored.startsWith("pbkdf2-sha256$100000$")).toBe(true);
    expect(await verifyPassword("pickled onion monster munch", stored)).toBe(true);
    expect(await verifyPassword("pickled onion monster munch!", stored)).toBe(false);
  });

  it("salts each hash differently", async () => {
    expect(await hashPassword("same password")).not.toBe(await hashPassword("same password"));
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("anything", "plaintext")).toBe(false);
  });
});

describe("tokens", () => {
  it("makes URL-safe random tokens", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(token);
  });

  it("hashes deterministically", async () => {
    expect(await sha256("abc")).toBe(await sha256("abc"));
    expect(await sha256("abc")).not.toBe(await sha256("abd"));
  });
});
