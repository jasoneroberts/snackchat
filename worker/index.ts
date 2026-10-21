import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { csrf } from "hono/csrf";
import type { AppContext } from "./env";
import { getSessionUser } from "./lib/session";
import { auth } from "./routes/auth";

const app = new Hono<AppContext>().basePath("/api");

// Reject form posts from other websites (cross-site request forgery).
app.use("*", csrf());

// Work out who is signed in once per request; routes read it with c.get("user").
app.use("*", async (c, next) => {
  c.set("user", await getSessionUser(c));
  await next();
});

app.route("/auth", auth);

app.get("/me", (c) => {
  const user = c.get("user");
  if (!user) return c.json({ user: null });
  return c.json({
    user: { id: user.id, username: user.username, emailVerified: user.email_verified === 1, country: user.country },
  });
});

app.get("/health", (c) => c.json({ ok: true }));

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  // Errors raised on purpose (such as the CSRF check) keep their own status.
  if (err instanceof HTTPException) return c.json({ error: err.message || "Forbidden" }, err.status);
  console.error(err);
  return c.json({ error: "Something went wrong." }, 500);
});

export default app;
