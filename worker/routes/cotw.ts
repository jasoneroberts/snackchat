import { Hono } from "hono";
import type { BattlePage } from "../../shared/achievements";
import type { AppContext } from "../env";
import { newBadgesSafely } from "../lib/achievements";
import { battleView, castVote, ensureBattle, lastBattle, repickBattle } from "../lib/battle";
import { currentUser } from "../lib/currentUser";

// Crisp of the Week (worker/lib/battle.ts): this week's pair, last week's
// result, and voting.
export const cotw = new Hono<AppContext>();

const now = () => Math.floor(Date.now() / 1000);

async function page(db: D1Database, viewerId: string): Promise<BattlePage> {
  const time = now();
  const [current, last] = await Promise.all([ensureBattle(db, time), lastBattle(db, time)]);
  return {
    current: current ? await battleView(db, current, viewerId, time) : null,
    last: last ? await battleView(db, last, viewerId, time) : null,
  };
}

cotw.get("/", async (c) => c.json(await page(c.env.DB, currentUser(c).id)));

// Vote, or change your vote: { snackId }. Answers with the page as it now
// stands (with the vote counts, now you've voted) and any badge just earned.
cotw.put("/vote", async (c) => {
  const user = currentUser(c);
  const body = await c.req.json<{ snackId?: unknown }>().catch(() => ({ snackId: undefined }));
  if (typeof body.snackId !== "string") return c.json({ error: "Pick one of this week's two." }, 400);
  const error = await castVote(c.env.DB, user.id, body.snackId, now());
  if (error) return c.json({ error }, 400);
  const newBadges = await newBadgesSafely(c.env.DB, user.id);
  return c.json({ ...(await page(c.env.DB, user.id)), newBadges });
});

// Admins: don't like this week's pair? Pick two others. This week's votes go too.
cotw.post("/repick", async (c) => {
  if (currentUser(c).is_admin !== 1) return c.json({ error: "Admins only." }, 403);
  await repickBattle(c.env.DB, now());
  return c.json(await page(c.env.DB, currentUser(c).id));
});
