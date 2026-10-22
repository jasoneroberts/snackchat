import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { csrf } from "hono/csrf";
import type { AppContext } from "./env";
import { devLoginUsername, getDevUser } from "./lib/devLogin";
import { getSessionUser } from "./lib/session";
import { turnstileInTestMode } from "./lib/turnstile";
import { auth } from "./routes/auth";

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

app.get("/me", (c) => {
  const user = c.get("user");
  if (!user) return c.json({ user: null });
  return c.json({
    user: { id: user.id, username: user.username, emailVerified: user.email_verified === 1, country: user.country },
    devLogin: devLoginUsername(c.env) !== null,
  });
});

// "turnstile": "test" means the bot check is not protecting anything yet.
// "devLogin": true means anyone with the link is signed in automatically.
app.get("/health", (c) =>
  c.json({
    ok: true,
    turnstile: turnstileInTestMode(c.env.TURNSTILE_SECRET_KEY) ? "test" : "live",
    devLogin: devLoginUsername(c.env) !== null,
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
