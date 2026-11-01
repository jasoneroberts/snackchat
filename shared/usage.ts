// Things the app records about how it's used, for the admin Stats page.
// Only what isn't already stored elsewhere: check-ins, likes, votes etc. have
// their own tables. See migrations/0031_app_usage.sql.

export const USAGE_FEATURES = {
  open: "Opened the app", // once a day, recorded by GET /api/me
  wingit: "Played Wing It", // caught the Golden Crisp and the game started
  share: "Shared something", // a check-in picture, badge, invite or squad link
} as const;

export type UsageFeature = keyof typeof USAGE_FEATURES;

export const isUsageFeature = (value: unknown): value is UsageFeature =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(USAGE_FEATURES, value);
