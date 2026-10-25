// Nightly backups. Every table is copied, row by row, into one JSON file in
// R2 (backups/YYYY-MM-DD.json). Photos are already in R2, so they aren't
// copied again. scripts/restore-backup.ts turns a file back into SQL.

import type { Backup } from "./restore";

export const BACKUP_PREFIX = "backups/";
// How many daily backups to keep. Older ones are deleted after each run.
export const KEEP_BACKUPS = 14;
const PAGE = 500;

/** backups/2026-10-25.json for a date. */
export const backupKey = (date: Date) => `${BACKUP_PREFIX}${date.toISOString().slice(0, 10)}.json`;

/** Only well-formed backup names can be downloaded, so this can't reach other files. */
export const isBackupName = (name: string) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name);

/** The tables worth keeping. D1's own bookkeeping tables are skipped. */
export async function listTables(db: D1Database): Promise<{ name: string; sql: string }[]> {
  const rows = await db
    .prepare(
      `SELECT name, sql FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
          AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'
          AND name NOT LIKE 'd1\\_%' ESCAPE '\\'
        ORDER BY rowid`,
    )
    .all<{ name: string; sql: string }>();
  return rows.results;
}

/** Read the whole database into one object. Tables come in the order they were created. */
export async function buildBackup(db: D1Database): Promise<Backup> {
  const tables: Backup["tables"] = [];
  for (const { name, sql } of await listTables(db)) {
    const rows: Record<string, unknown>[] = [];
    // Page through so one huge table can't hit D1's result size limit.
    for (let offset = 0; ; offset += PAGE) {
      const page = await db.prepare(`SELECT * FROM "${name}" LIMIT ${PAGE} OFFSET ${offset}`).all<Record<string, unknown>>();
      rows.push(...page.results);
      if (page.results.length < PAGE) break;
    }
    tables.push({ name, sql, rows });
  }
  return { version: 1, createdAt: new Date().toISOString(), tables };
}

/** Make tonight's backup and delete the ones past KEEP_BACKUPS. */
export async function runBackup(db: D1Database, bucket: R2Bucket, date = new Date()): Promise<{ key: string; bytes: number; rows: number }> {
  const backup = await buildBackup(db);
  const body = JSON.stringify(backup);
  const key = backupKey(date);
  await bucket.put(key, body, { httpMetadata: { contentType: "application/json" } });

  const list = await bucket.list({ prefix: BACKUP_PREFIX });
  const old = list.objects
    .map((o) => o.key)
    .sort()
    .reverse()
    .slice(KEEP_BACKUPS);
  if (old.length) await bucket.delete(old);

  return { key, bytes: body.length, rows: backup.tables.reduce((n, t) => n + t.rows.length, 0) };
}
