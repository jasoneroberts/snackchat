import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { csrf } from "hono/csrf";
import type { AppContext } from "./env";
import { devLoginUsername, getDevUser } from "./lib/devLogin";
import { quickSignInOn } from "./lib/quickSignIn";
import { getSessionUser } from "./lib/session";
import { turnstileInTestMode } from "./lib/turnstile";
import { admin, reviewCount } from "./routes/admin";
import { auth } from "./routes/auth";
import { avatars } from "./routes/avatars";
import { boards } from "./routes/boards";
import { checkins } from "./routes/checkins";
import { groups } from "./routes/groups";
import { photos } from "./routes/photos";
import { snacks } from "./routes/snacks";
import { users } from "./routes/users";

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

app.route("/auth", auth);
app.route("/snacks", snacks);
app.route("/checkins", checkins);
app.route("/photos", photos);
app.route("/avatars", avatars);
app.route("/admin", admin);
app.route("/users", users);
app.route("/groups", groups);
app.route("/boards", boards);

app.get("/me", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ user: null, quickSignIn: quickSignInOn(c.env) });
  const points = await c.env.DB.prepare("SELECT COALESCE(SUM(points), 0) AS total FROM points_ledger WHERE user_id = ?")
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
      isAdmin: user.is_admin === 1,
      // Admins see how many photos are waiting for them.
      reviewCount: user.is_admin === 1 ? await reviewCount(c.env.DB) : 0,
    },
    devLogin: devLoginUsername(c.env) !== null,
    quickSignIn: quickSignInOn(c.env),
  });
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
  return c.json({ error: "Something went wrong." }, 500);
});

export default app;
