import { describe, expect, it } from "vitest";
import { reminderMessage } from "../worker/lib/reminders";

describe("check-in reminders", () => {
  it("says how long it's been", () => {
    expect(reminderMessage("grownup", 4).body).toContain("4 days since your last check-in");
    expect(reminderMessage("lad", 5).body).toContain("5 days without a check-in");
  });

  it("has its own words for people who've never checked in", () => {
    expect(reminderMessage(null, null).body).toContain("Rate your first snack");
    expect(reminderMessage("lad", null).title).toContain("not logged");
  });
});
