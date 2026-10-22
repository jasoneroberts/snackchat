// Everything the Worker can reach, as declared in wrangler.jsonc.
// Secrets (TURNSTILE_SECRET_KEY, RESEND_API_KEY) are set with `wrangler secret put`.
export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  CACHE: KVNamespace;
  PHOTOS: R2Bucket;
  AUTH_LIMITER: RateLimit;
  APP_NAME: string;
  EMAIL_MODE: "log" | "resend";
  EMAIL_FROM: string;
  // Internal development only: open the app as this user with no log-in.
  DEV_LOGIN_AS?: string;
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  email_verified: number;
  country: string;
  is_admin: number;
  avatar_id: string | null;
  avatar_pending_id: string | null;
  voice: string | null;
}

export type AppContext = {
  Bindings: Env;
  Variables: { user: User | null };
};
