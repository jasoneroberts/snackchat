// Turn a backup file back into SQL that D1 can run. Kept free of imports so
// the restore script can load it straight into Node.

export interface Backup {
  version: 1;
  createdAt: string;
  tables: { name: string; sql: string; rows: Record<string, unknown>[] }[];
}

// Rows per INSERT. D1 caps the size of one statement, so long tables are split.
const ROWS_PER_INSERT = 50;

/** A value as an SQL literal: NULL, a number, or a quoted string. */
export function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "string") return `'${v.replaceAll("'", "''")}'`;
  // Blobs come back from D1 as arrays of bytes.
  if (Array.isArray(v)) return `X'${v.map((b) => Number(b).toString(16).padStart(2, "0")).join("")}'`;
  return `'${JSON.stringify(v).replaceAll("'", "''")}'`;
}

const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;

/**
 * SQL that empties each table and puts the backup's rows back. Run it on a
 * database that already has the tables (all migrations applied). Foreign key
 * checks wait until the end, so the order rows go in doesn't matter.
 */
export function restoreSql(backup: Backup, only?: string[]): string {
  if (backup.version !== 1 || !Array.isArray(backup.tables)) throw new Error("Not a Crunchd backup file.");
  const tables = only ? backup.tables.filter((t) => only.includes(t.name)) : backup.tables;
  const out = ["PRAGMA defer_foreign_keys = on;"];
  // Empty children before parents, then fill parents before children.
  for (const t of [...tables].reverse()) out.push(`DELETE FROM ${ident(t.name)};`);
  for (const t of tables) {
    if (!t.rows.length) continue;
    const columns = Object.keys(t.rows[0]);
    for (let i = 0; i < t.rows.length; i += ROWS_PER_INSERT) {
      const values = t.rows
        .slice(i, i + ROWS_PER_INSERT)
        .map((row) => `(${columns.map((c) => sqlValue(row[c])).join(", ")})`)
        .join(",\n  ");
      out.push(`INSERT INTO ${ident(t.name)} (${columns.map(ident).join(", ")}) VALUES\n  ${values};`);
    }
  }
  return out.join("\n") + "\n";
}
