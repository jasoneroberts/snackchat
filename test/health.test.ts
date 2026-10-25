import { describe, expect, it } from "vitest";
import { describeAdminAction } from "../shared/audit";
import { backupKey, isBackupName } from "../worker/lib/backup";
import { ALERT_THRESHOLD, clip, readClientError, shouldAlert } from "../worker/lib/health";
import { restoreSql, sqlValue, type Backup } from "../worker/lib/restore";

describe("readClientError", () => {
  it("keeps a message, detail and path, trimmed to size", () => {
    const r = readClientError({ message: " boom ", detail: "x".repeat(5000), path: "/explore" });
    expect(r).toEqual({ message: "boom", detail: "x".repeat(4000), path: "/explore" });
  });

  it("ignores anything without a message", () => {
    expect(readClientError(null)).toBeNull();
    expect(readClientError({ message: "" })).toBeNull();
    expect(readClientError({ message: 42 })).toBeNull();
    expect(readClientError("boom")).toBeNull();
  });

  it("clip drops empty or non-string values", () => {
    expect(clip("  ", 10)).toBeNull();
    expect(clip(undefined, 10)).toBeNull();
    expect(clip("abcdef", 3)).toBe("abc");
  });
});

describe("shouldAlert", () => {
  it("alerts at the threshold, but not twice in the quiet period", () => {
    expect(shouldAlert(ALERT_THRESHOLD - 1, false)).toBe(false);
    expect(shouldAlert(ALERT_THRESHOLD, false)).toBe(true);
    expect(shouldAlert(ALERT_THRESHOLD * 5, true)).toBe(false);
  });
});

describe("describeAdminAction", () => {
  it("names common admin actions", () => {
    expect(describeAdminAction("POST", "/users/abc/pin", "{}")).toBe("Reset a PIN");
    expect(describeAdminAction("POST", "/photos/p1", '{"action":"reject"}')).toBe("Rejected a photo");
    expect(describeAdminAction("POST", "/photos/p1", '{"action":"approve"}')).toBe("Approved a photo");
    expect(describeAdminAction("POST", "/photos/p1/hide", null)).toBe("Hid a photo");
    expect(describeAdminAction("POST", "/snacks/s1/status", '{"action":"approve"}')).toBe("Approved a new snack");
  });

  it("shows unknown requests as they are", () => {
    expect(describeAdminAction("POST", "/something/new", "not json")).toBe("POST /something/new");
  });
});

describe("backup names", () => {
  it("are one file per day and nothing else can be downloaded", () => {
    expect(backupKey(new Date("2026-10-25T03:00:00Z"))).toBe("backups/2026-10-25.json");
    expect(isBackupName("2026-10-25.json")).toBe(true);
    expect(isBackupName("../photos/x.jpg")).toBe(false);
    expect(isBackupName("2026-10-25.json/../x")).toBe(false);
  });
});

describe("restoreSql", () => {
  const backup: Backup = {
    version: 1,
    createdAt: "2026-10-25T03:00:00.000Z",
    tables: [
      { name: "users", sql: "", rows: [{ id: "u1", username: "o'brien", bio: null }] },
      { name: "checkins", sql: "", rows: [{ id: "c1", user_id: "u1", overall: 4.5 }] },
      { name: "empty", sql: "", rows: [] },
    ],
  };

  it("quotes values safely", () => {
    expect(sqlValue(null)).toBe("NULL");
    expect(sqlValue(3)).toBe("3");
    expect(sqlValue("it's")).toBe("'it''s'");
    expect(sqlValue([1, 255])).toBe("X'01ff'");
  });

  it("empties children first, fills parents first", () => {
    const sql = restoreSql(backup);
    expect(sql.startsWith("PRAGMA defer_foreign_keys = on;")).toBe(true);
    expect(sql.indexOf('DELETE FROM "checkins"')).toBeLessThan(sql.indexOf('DELETE FROM "users"'));
    expect(sql.indexOf('INSERT INTO "users"')).toBeLessThan(sql.indexOf('INSERT INTO "checkins"'));
    expect(sql).toContain("('u1', 'o''brien', NULL)");
    expect(sql).not.toContain('INSERT INTO "empty"');
  });

  it("can restore just some tables", () => {
    const sql = restoreSql(backup, ["checkins"]);
    expect(sql).not.toContain('"users"');
    expect(sql).toContain('INSERT INTO "checkins"');
  });

  it("refuses a file that isn't a backup", () => {
    expect(() => restoreSql({ tables: "nope" } as unknown as Backup)).toThrow();
  });
});
