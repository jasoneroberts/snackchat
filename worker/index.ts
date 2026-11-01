import { totalPointsSql } from "./lib/boards";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { csrf } from "hono/csrf";
import { isVoice } from "../shared/voice";
import type { AppContext, Env } from "./env";
import { runBackup } from "./lib/backup";
import { canonicalRedirect } from "./lib/canonicalHost";
import { withInvitePreview } from "./lib/linkPreview";
import { currentUser } from "./lib/currentUser";
import { devLoginUsername, getDevUser } from "./lib/devLogin";
import { quickSignInOn } from "./lib/quickSignIn";
import { isUsageFeature } from "../shared/usage";
import { recordUsage } from "./lib/usage";
import { checkErrorSpike, logError, pruneLogs, readClientError } from "./lib/health";
import { newUserCount } from "./lib/notify";
import { getSessionUser } from "./lib/session";
import { isWrite } from "./lib/limits";
import { turnstileInTestMode } from "./lib/turnstile";
import { account } from "./routes/account";
import { admin, openReportCount, pendingSnackCount, reviewCount } from "./routes/admin";
import { auth } from "./routes/auth";
import { avatars } from "./routes/avatars";
import { boards } from "./routes/boards";
import { checkins } from "./routes/checkins";
import { explore } from "./routes/explore";
import { groups } from "./routes/groups";
import { logos } from "./routes/logos";
import { photos } from "./routes/photos";
import { push } from "./routes/push";
import { blocks, reports } from "./routes/safety";
import { snacks } from "./routes/snacks";
import { users } from "./routes/users";
import { REMINDER_HOUR_UTC, sendReminders } from "./lib/reminders";
import { sendStreakNudges } from "./lib/achievements";
import { achievements } from "./routes/achievements";
import { champions } from "./routes/champions";
import { week } from "./routes/week";
import { joins } from "./routes/joins";

// Where the app lives, for push messages sent from the cron (no request to read it from).
const appOrigin = (env: Env) => (env.CANONICAL_HOST ? `https://${env.CANONICAL_HOST}` : "https://snackchat.jasoneroberts.workers.dev");

const app = new Hono<AppContext>().basePath("/api");

// Reject form posts from other websites (cross-site request forgery).
app.use("*", csrf());

// Work out who is signed in once per request; routes read it with c.get("user").
// In dev-login mode, a visitor with no session becomes the DEV_LOGIN_AS user.
app.use("*", async (c, next) => {
  let user = await getSessionUser(c);
  const devName = devLoginUsername(c.env);
  if (!user && devName) user = await getDevUser(c, devName);
  c.set("user", user);
  await next();
});

// The burst limit on changes, per signed-in person (lib/limits.ts). Sign-in
// has its own per-address limit, and error reports theirs.
app.use("*", async (c, next) => {
  const user = c.get("user");
  if (user && user.is_admin !== 1 && isWrite(c.req.method) && !c.req.path.startsWith("/api/auth/") && c.req.path !== "/api/errors" && c.req.path !== "/api/usage") {
    const { success } = await c.env.WRITE_LIMITER.limit({ key: `write:${user.id}` });
    if (!success) return c.json({ error: "Slow down a bit. Wait a minute and try again." }, 429);
  }
  await next();
});

app.route("/auth", auth);
app.route("/snacks", snacks);
app.route("/checkins", checkins);
app.route("/photos", photos);
app.route("/avatars", avatars);
app.route("/logos", logos);
app.route("/admin", admin);
app.route("/users", users);
app.route("/groups", groups);
app.route("/boards", boards);
app.route("/explore", explore);
app.route("/reports", reports);
app.route("/blocks", blocks);
app.route("/account", account);
app.route("/push", push);
app.route("/achievements", achievements);
app.route("/champions", champions);
app.route("/week", week);
app.route("/joins", joins);

app.get("/me", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ user: null, quickSignIn: quickSignInOn(c.env) });
  // Every app load asks for /me, so this is where "opened the app today" is
  // noted for the Stats page. waitUntil: it runs after the reply has gone,
  // so it never slows the app down.
  c.executionCtx.waitUntil(recordUsage(c.env.DB, user.id, "open"));
  const points = await c.env.DB.prepare(`SELECT (${totalPointsSql("?")}) AS total`)
    .bind(user.id)
    .first<{ total: number }>();
  return c.json({
    user: {
      id: user.id,
      username: user.username,
      emailVerified: user.email_verified === 1,
      country: user.country,
      points: points?.total ?? 0,
      avatarId: user.avatar_id,
      avatarPendingId: user.avatar_pending_id,
      voice: isVoice(user.voice) ? user.voice : null,
      isAdmin: user.is_admin === 1,
      // Admins see how many photos are waiting for them.
      reviewCount: user.is_admin === 1 ? await reviewCount(c.env.DB) : 0,
      // ...and how many new snacks people have added.
      pendingSnacks: user.is_admin === 1 ? await pendingSnackCount(c.env.DB) : 0,
      // ...and how many reports are waiting.
      openReports: user.is_admin === 1 ? await openReportCount(c.env.DB) : 0,
      // ...and how many people have joined since they last looked at Users.
      newUsers: user.is_admin === 1 ? await newUserCount(c.env.DB, user.id) : 0,
      // Check-in reminders, like and squad messages on or off (Settings > Notifications).
      ...(await notificationPrefs(c.env.DB, user.id)),
    },
    devLogin: devLoginUsername(c.env) !== null,
    quickSignIn: quickSignInOn(c.env),
  });
});

/** All the notification switches in one read. Missing row counts as on. */
async function notificationPrefs(db: D1Database, userId: string): Promise<{ reminders: boolean; likeAlerts: boolean; squadAlerts: boolean }> {
  const row = await db
    .prepare("SELECT reminders, like_alerts, squad_alerts FROM users WHERE id = ?")
    .bind(userId)
    .first<{ reminders: number; like_alerts: number; squad_alerts: number }>();
  return { reminders: row?.reminders !== 0, likeAlerts: row?.like_alerts !== 0, squadAlerts: row?.squad_alerts !== 0 };
}

// Pick lad mode or grown-up mode. Only words and colours change.
app.put("/me/voice", async (c) => {
  const user = currentUser(c);
  const { voice } = await c.req.json<{ voice?: unknown }>().catch(() => ({ voice: undefined }));
  if (!isVoice(voice)) return c.json({ error: "Pick grown-up or lad mode." }, 400);
  await c.env.DB.prepare("UPDATE users SET voice = ? WHERE id = ?").bind(voice, user.id).run();
  return c.json({ voice });
});

// The app notes Wing It games and shares here (src/lib/track.ts), for the
// admin Stats page. Not counted against the write limit: it's not a change
// anyone else sees, and a busy sharer shouldn't be told to slow down.
app.post("/usage", async (c) => {
  const user = currentUser(c);
  const { feature } = await c.req.json<{ feature?: unknown }>().catch(() => ({ feature: undefined }));
  // "open" is only ever recorded by /me, so it can't be inflated from outside.
  if (!isUsageFeature(feature) || feature === "open") return c.json({ error: "Unknown feature." }, 400);
  await recordUsage(c.env.DB, user.id, feature);
  return c.json({ ok: true });
});

// The app reports its own crashes here (see src/lib/reportError.ts). Works
// signed out too, since a crash on the sign-in page matters as much.
app.post("/errors", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  // A phone stuck in a crash loop shouldn't flood the log.
  if (!(await c.env.AUTH_LIMITER.limit({ key: `errors:${ip}` })).success) return c.json({ ok: false }, 429);
  const report = readClientError(await c.req.json().catch(() => null));
  if (!report) return c.json({ error: "Not an error report." }, 400);
  await logError(c.env.DB, { source: "client", ...report, userId: c.get("user")?.id, userAgent: c.req.header("User-Agent") });
  return c.json({ ok: true });
});

// "turnstile": "test" means the bot check is not protecting anything yet.
// "devLogin": true means anyone with the link is signed in automatically.
app.get("/health", (c) =>
  c.json({
    ok: true,
    turnstile: turnstileInTestMode(c.env.TURNSTILE_SECRET_KEY) ? "test" : "live",
    devLogin: devLoginUsername(c.env) !== null,
    quickSignIn: quickSignInOn(c.env),
  }),
);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  // Errors raised on purpose (such as the CSRF check) keep their own status.
  if (err instanceof HTTPException) return c.json({ error: err.message || "Forbidden" }, err.status);
  console.error(err);
  // Written to the error log for Settings > Health, without slowing the reply.
  const entry = {
    source: "server" as const,
    message: err.message || String(err),
    detail: err.stack ?? null,
    path: `${c.req.method} ${c.req.path}`,
    userId: c.get("user")?.id,
    userAgent: c.req.header("User-Agent"),
  };
  c.executionCtx.waitUntil(logError(c.env.DB, entry).catch((e) => console.error("error log", e)));
  return c.json({ error: "Something went wrong." }, 500);
});

// Timed jobs, set in wrangler.jsonc "triggers". Every hour: check for an
// error spike. At 03:00 UTC: back up the database and clear old logs. At
// 18:00 UTC: reminders, plus streak nudges on Sundays.
async function scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
  if (controller.cron === "0 3 * * *") {
    const result = await runBackup(env.DB, env.PHOTOS);
    console.log(`[backup] ${result.key}: ${result.rows} rows, ${result.bytes} bytes`);
    ctx.waitUntil(pruneLogs(env.DB));
  } else {
    const result = await checkErrorSpike(env);
    if (result.alerted) console.log(`[alert] sent for ${result.errors} errors`);
    const at = new Date(controller.scheduledTime);
    if (at.getUTCHours() === REMINDER_HOUR_UTC) {
      const now = Math.floor(controller.scheduledTime / 1000);
      // Sunday: a nudge for anyone whose weekly streak ends at midnight.
      const nudged = at.getUTCDay() === 0 ? await sendStreakNudges(env, appOrigin(env), now) : new Set<string>();
      if (nudged.size) console.log(`[streaks] nudged ${nudged.size}`);
      const reminded = await sendReminders(env, appOrigin(env), now, nudged);
      console.log(`[reminders] sent to ${reminded}`);
    }
  }
}

// Every page request comes here first (wrangler.jsonc "run_worker_first").
// Old and www addresses are redirected to the real one; /api goes to the Hono
// app above; anything else is a file from the React build (squad invite pages
// with their own link preview).
async function fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const target = canonicalRedirect(url, request.method, env.CANONICAL_HOST);
  if (target) return Response.redirect(target, 301);
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return app.fetch(request, env, ctx);
  const page = await env.ASSETS.fetch(request);
  // Squad invite links get their own preview card in chats (lib/linkPreview.ts).
  return request.method === "GET" ? withInvitePreview(request, page, env.DB) : page;
}

export default { fetch, scheduled } satisfies ExportedHandler<Env>;
