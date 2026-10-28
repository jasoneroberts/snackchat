import { describe, expect, it } from "vitest";
import { canonicalRedirect } from "../worker/lib/canonicalHost";

const HOST = "getcrunchd.com";
const go = (url: string, method = "GET", host: string | undefined = HOST) => canonicalRedirect(new URL(url), method, host);

describe("canonicalRedirect", () => {
  it("sends pages on the old workers.dev link to the same path on the new address", () => {
    expect(go("https://snackchat.jasoneroberts.workers.dev/")).toBe("https://getcrunchd.com/");
    expect(go("https://snackchat.jasoneroberts.workers.dev/join/ABC123?x=1")).toBe("https://getcrunchd.com/join/ABC123?x=1");
    expect(go("https://snackchat.jasoneroberts.workers.dev/welcome", "HEAD")).toBe("https://getcrunchd.com/welcome");
  });

  it("sends www to the bare address", () => {
    expect(go("https://www.getcrunchd.com/boards")).toBe("https://getcrunchd.com/boards");
  });

  it("serves the real address, API calls, form posts and previews as they are", () => {
    expect(go("https://getcrunchd.com/boards")).toBeNull();
    expect(go("https://snackchat.jasoneroberts.workers.dev/api/me")).toBeNull();
    expect(go("https://snackchat.jasoneroberts.workers.dev/api")).toBeNull();
    expect(go("https://snackchat.jasoneroberts.workers.dev/", "POST")).toBeNull();
    expect(go("https://1a2b3c4d-snackchat.jasoneroberts.workers.dev/")).toBeNull();
    expect(go("http://localhost:5173/")).toBeNull();
  });

  it("does nothing until a real address is set", () => {
    expect(canonicalRedirect(new URL("https://snackchat.jasoneroberts.workers.dev/"), "GET", undefined)).toBeNull();
    expect(go("https://snackchat.jasoneroberts.workers.dev/", "GET", "")).toBeNull();
  });
});
