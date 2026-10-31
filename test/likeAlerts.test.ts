import { describe, expect, it } from "vitest";
import { likeMessage } from "../worker/lib/likeAlerts";

describe("like messages", () => {
  it("names who liked it and the snack", () => {
    expect(likeMessage("grownup", "sam", "Wotsits", 0)).toEqual({ title: "sam liked your check-in", body: "sam liked your Wotsits check-in." });
  });

  it("counts the other hearts", () => {
    expect(likeMessage(null, "sam", "Wotsits", 1).body).toBe("sam and 1 other liked your Wotsits check-in.");
    expect(likeMessage(null, "sam", "Wotsits", 3).body).toBe("sam and 3 others liked your Wotsits check-in.");
  });

  it("has lad words", () => {
    const m = likeMessage("lad", "dave", "Scampi Fries", 2);
    expect(m.title).toBe("dave rates your Scampi Fries");
    expect(m.body).toContain("dave and 2 others gave your Scampi Fries check-in a heart");
  });
});
