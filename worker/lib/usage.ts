import type { UsageFeature } from "../../shared/usage";

/** Today, as whole days since 1970 (UTC): the app_usage.day column. */
export const today = (nowSeconds = Math.floor(Date.now() / 1000)) => Math.floor(nowSeconds / 86400);

/**
 * Note that someone did something today. "open" is written once a day (the
 * first time wins and later ones do nothing); anything else adds one.
 *
 * Never throws: usage counts are nice to have, and must never break the
 * thing the person was actually doing. (Before migration 0030 is applied the
 * table doesn't exist, and this quietly does nothing.)
 */
export async function recordUsage(db: D1Database, userId: string, feature: UsageFeature): Promise<void> {
  const onConflict = feature === "open" ? "DO NOTHING" : "DO UPDATE SET times = times + 1";
  try {
    await db
      .prepare(
        `INSERT INTO app_usage (user_id, day, feature, times) VALUES (?, ?, ?, 1)
         ON CONFLICT (user_id, day, feature) ${onConflict}`,
      )
      .bind(userId, today(), feature)
      .run();
  } catch (err) {
    console.error("usage", err);
  }
}

/** Whether migration 0030 has been applied yet. */
export async function hasUsageTable(db: D1Database): Promise<boolean> {
  const row = await db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'app_usage'").first();
  return row !== null;
}
