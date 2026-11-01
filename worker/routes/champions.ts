import { Hono } from "hono";
import type { AppContext } from "../env";
import { cachedCrowns, lastWeeksChampions } from "../lib/champions";

// Last week's top snack and top snacker (lib/champions.ts). The feed asks
// for them on Mondays only.
export const champions = new Hono<AppContext>();

champions.get("/", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const result = await lastWeeksChampions(c.env.DB, now);
  return c.json(result);
});

// Who wears a crown this week: people (global and squad champions) and
// snacks (last week's and last month's winners). The app asks once per open.
champions.get("/crowns", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  return c.json(await cachedCrowns(c.env, now));
});
