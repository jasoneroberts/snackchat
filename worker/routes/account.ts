import { Hono } from "hono";
import type { AppContext } from "../env";
import { deleteAccount, exportAccount } from "../lib/account";
import { verifyPassword } from "../lib/crypto";
import { currentUser } from "../lib/currentUser";
import { destroySession } from "../lib/session";

// Your data: download it all, or delete your account. Settings links here.
export const account = new Hono<AppContext>();

// Everything about you as a JSON file.
account.get("/export", async (c) => {
  const user = currentUser(c);
  const data = await exportAccount(c.env.DB, user.id, new URL(c.req.url).origin);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="snackchat-${user.username}.json"`,
      "Cache-Control": "no-store",
    },
  });
});

// Delete your account for good: { pin } (your PIN or password), to be sure it's you.
account.post("/delete", async (c) => {
  const user = currentUser(c);
  const body = (await c.req.json().catch(() => null)) as { pin?: unknown } | null;
  const pin = typeof body?.pin === "string" ? body.pin : "";
  const row = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string | null }>();
  if (!row?.password_hash || !(await verifyPassword(pin, row.password_hash))) {
    return c.json({ error: "That PIN isn't right." }, 401);
  }
  if (user.is_admin === 1) {
    const admins = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE is_admin = 1").first<{ n: number }>();
    if ((admins?.n ?? 0) <= 1) return c.json({ error: "You're the only admin. Make someone else an admin first." }, 400);
  }
  await destroySession(c);
  await deleteAccount(c.env, user.id);
  return c.json({ ok: true });
});
