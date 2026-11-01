import { Hono } from "hono";
import type { AppContext } from "../env";
import { currentUser } from "../lib/currentUser";
import { lastWeek, yourWeek } from "../lib/yourWeek";

// Your last week, for the "Your week" card at the top of the feed (lib/yourWeek.ts).
export const week = new Hono<AppContext>();

week.get("/", async (c) => {
  const { since, until } = lastWeek(Math.floor(Date.now() / 1000));
  return c.json(await yourWeek(c.env.DB, currentUser(c).id, since, until));
});
