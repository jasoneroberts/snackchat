import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppContext, User } from "../env";

/** The signed-in user, or a 401 "Sign in first." if there isn't one. */
export function currentUser(c: Context<AppContext>): User {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "Sign in first." });
  return user;
}
