import { Hono } from "hono";
import type { AppContext } from "../env";
import { currentUser } from "../lib/currentUser";
import { notifyAdmins, vapidKeys } from "../lib/notify";

// Push notifications on this phone. Only admins can turn them on for now:
// they're how admins hear about new people, photos, reports and snacks.
export const push = new Hono<AppContext>();

push.use("*", async (c, next) => {
  if (currentUser(c).is_admin !== 1) return c.json({ error: "Admins only." }, 403);
  await next();
});

// The public key the browser needs to subscribe.
push.get("/key", async (c) => c.json({ publicKey: (await vapidKeys(c.env.DB)).publicKey }));

// Turn notifications on: { endpoint, keys: { p256dh, auth } } from PushSubscription.toJSON().
push.put("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  if (!endpoint.startsWith("https://") || endpoint.length > 1000 || !p256dh || !auth) {
    return c.json({ error: "That doesn't look like a push subscription." }, 400);
  }
  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, unixepoch())
     ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  )
    .bind(endpoint, currentUser(c).id, p256dh, auth)
    .run();
  return c.json({ ok: true });
});

// Turn them off on this phone.
push.delete("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint === "string") {
    await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?").bind(body.endpoint, currentUser(c).id).run();
  }
  return c.json({ ok: true });
});

// Send yourself a test, to check it works on this phone.
push.post("/test", async (c) => {
  const user = currentUser(c);
  const { results } = await c.env.DB.prepare("SELECT endpoint FROM push_subscriptions WHERE user_id = ?").bind(user.id).all();
  if (!results.length) return c.json({ error: "Notifications aren't on for any of your phones yet." }, 400);
  const sent = await notifyAdmins(c.env, new URL(c.req.url).origin, {
    kind: "user",
    title: "Crunchd notifications are on",
    body: "You'll hear about new people, photos, reports and snacks here.",
    url: "/settings",
  }, { only: user.id });
  return c.json({ sent });
});
