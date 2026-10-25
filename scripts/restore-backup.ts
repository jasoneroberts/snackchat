// Turn a Snackchat backup (from Settings > Health, or R2 backups/) into SQL.
//
//   node scripts/restore-backup.ts backup.json > restore.sql
//   npx wrangler d1 execute snackchat-db --remote --file restore.sql
//
// The database must already have every table (run the migrations first on a
// fresh one). This REPLACES what's in those tables with the backup's rows.
// Add --tables=users,checkins to restore just some tables.

import { readFileSync } from "node:fs";
import { restoreSql, type Backup } from "../worker/lib/restore.ts";

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node scripts/restore-backup.ts <backup.json> [--tables=a,b] > restore.sql");
  process.exit(1);
}
const only = flags.find((f) => f.startsWith("--tables="))?.slice("--tables=".length).split(",");
const backup = JSON.parse(readFileSync(file, "utf8")) as Backup;
process.stdout.write(restoreSql(backup, only));
const rows = backup.tables.filter((t) => !only || only.includes(t.name)).reduce((n, t) => n + t.rows.length, 0);
console.error(`Backup from ${backup.createdAt}: ${rows} rows.`);
