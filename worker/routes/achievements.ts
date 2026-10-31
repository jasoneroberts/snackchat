import { Hono } from "hono";
import type { AppContext } from "../env";
import { awardSecretBadge, checkAchievements } from "../lib/achievements";
import { currentUser } from "../lib/currentUser";

// Your own badges and streak. Other people's come with their profile
// (GET /api/users/:username), which already knows about private profiles
// and blocks.
export const achievements = new Hono<AppContext>();

achievements.get("/", async (c) => {
  const { page } = await checkAchievements(c.env.DB, currentUser(c).id);
  return c.json(page);
});

// A hidden game hands out its secret badge here (only ids listed in
// SECRET_BADGES in shared/achievements.ts). Giving it twice does nothing:
// `new` says whether this was the first time.
achievements.post("/secret/:id", async (c) => {
  const result = await awardSecretBadge(c.env.DB, currentUser(c).id, c.req.param("id"));
  if (!result) return c.json({ error: "No such badge." }, 404);
  return c.json(result);
});
