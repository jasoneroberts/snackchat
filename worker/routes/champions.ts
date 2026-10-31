import { Hono } from "hono";
import type { AppContext } from "../env";
import { lastWeeksChampions } from "../lib/champions";

// Last week's top snack and top snacker (lib/champions.ts). The feed asks
// for them on Mondays only.
export const champions = new Hono<AppContext>();

champions.get("/", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const result = await lastWeeksChampions(c.env.DB, now);
  return c.json(result);
});
