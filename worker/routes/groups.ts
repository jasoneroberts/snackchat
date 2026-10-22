import { Hono } from "hono";
import type { BoardRow, GroupCard, GroupPage, GroupPreview, ResetPeriod, ScoringMode } from "../../shared/types";
import type { AppContext } from "../env";
import { newId } from "../lib/crypto";
import { currentUser } from "../lib/currentUser";
import {
  MAX_MEMBERS,
  MAX_OWNED_GROUPS,
  newInviteCode,
  normaliseCode,
  periodEnd,
  periodStart,
  rank,
  validateGroup,
} from "../lib/groups";
import { LATEST_PHOTO } from "../lib/photoSql";

export const groups = new Hono<AppContext>();

const now = () => Math.floor(Date.now() / 1000);

interface GroupRow {
  id: string;
  name: string;
  invite_code: string;
  scoring_mode: ScoringMode;
  reset_period: ResetPeriod;
  categories: string | null;
  created_by: string;
  created_at: number;
}

// Only check-ins of the group's snack types count. ?3 is the JSON list of
// types, or NULL for all of them.
const COUNTS = `s.category_id IN (SELECT value FROM json_each(?3)) OR ?3 IS NULL`;

// What each scoring mode adds up for one member (m.user_id) since ?2.
const SCORE_SQL: Record<ScoringMode, string> = {
  points: `SELECT COALESCE(SUM(pl.points), 0) FROM points_ledger pl
             JOIN checkins c ON c.id = pl.checkin_id JOIN snacks s ON s.id = c.snack_id
            WHERE pl.user_id = m.user_id AND pl.created_at >= ?2 AND (${COUNTS})`,
  checkins: `SELECT COUNT(*) FROM checkins c JOIN snacks s ON s.id = c.snack_id
              WHERE c.user_id = m.user_id AND c.created_at >= ?2 AND (${COUNTS})`,
  unique: `SELECT COUNT(DISTINCT c.snack_id) FROM checkins c JOIN snacks s ON s.id = c.snack_id
            WHERE c.user_id = m.user_id AND c.created_at >= ?2 AND (${COUNTS})`,
};

/** The group's leaderboard for the current period, every member included. */
async function leaderboard(db: D1Database, g: GroupRow): Promise<BoardRow[]> {
  const { results } = await db
    .prepare(
      `SELECT u.username, u.avatar_id AS avatarId, m.role, (${SCORE_SQL[g.scoring_mode]}) AS value
         FROM group_members m JOIN users u ON u.id = m.user_id
        WHERE m.group_id = ?1`,
    )
    .bind(g.id, periodStart(g.reset_period, now()), g.categories)
    .all<{ username: string; avatarId: string | null; role: BoardRow["role"]; value: number }>();
  return rank(results);
}

async function membership(db: D1Database, groupId: string, userId: string) {
  return db
    .prepare(
      `SELECT g.*, m.role FROM groups g JOIN group_members m ON m.group_id = g.id
        WHERE g.id = ? AND m.user_id = ?`,
    )
    .bind(groupId, userId)
    .first<GroupRow & { role: BoardRow["role"] }>();
}

// Your groups, newest first, with your place on each board.
groups.get("/", async (c) => {
  const user = currentUser(c);
  const { results } = await c.env.DB.prepare(
    `SELECT g.*, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS members
       FROM groups g JOIN group_members m ON m.group_id = g.id
      WHERE m.user_id = ?
      ORDER BY m.joined_at DESC`,
  )
    .bind(user.id)
    .all<GroupRow & { members: number }>();

  const cards: GroupCard[] = await Promise.all(
    results.map(async (g) => {
      const board = await leaderboard(c.env.DB, g);
      return {
        id: g.id,
        name: g.name,
        members: g.members,
        scoringMode: g.scoring_mode,
        resetPeriod: g.reset_period,
        myRank: board.find((r) => r.username === user.username)?.rank ?? null,
      };
    }),
  );
  return c.json({ groups: cards });
});

// Start a group. The creator is its owner and first member.
groups.post("/", async (c) => {
  const user = currentUser(c);
  const parsed = validateGroup(await c.req.json().catch(() => null));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const input = parsed.value;
  const db = c.env.DB;

  const owned = await db
    .prepare("SELECT COUNT(*) AS n FROM groups WHERE created_by = ?")
    .bind(user.id)
    .first<{ n: number }>();
  if ((owned?.n ?? 0) >= MAX_OWNED_GROUPS) {
    return c.json({ error: `You can run up to ${MAX_OWNED_GROUPS} groups.` }, 400);
  }

  const id = newId();
  const time = now();
  // Codes are random, so a clash is very unlikely; try again if one happens.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newInviteCode();
    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO groups (id, name, invite_code, scoring_mode, reset_period, categories, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            input.name,
            code,
            input.scoringMode,
            input.resetPeriod,
            input.categories ? JSON.stringify(input.categories) : null,
            user.id,
            time,
          ),
        db
          .prepare("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)")
          .bind(id, user.id, time),
      ]);
      return c.json({ id, inviteCode: code }, 201);
    } catch (err) {
      if (!String(err).includes("UNIQUE")) throw err;
    }
  }
  return c.json({ error: "Couldn't make an invite code. Try again." }, 500);
});

async function findByCode(db: D1Database, code: string) {
  return db
    .prepare(
      `SELECT g.id, g.name, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS members
         FROM groups g WHERE g.invite_code = ?`,
    )
    .bind(normaliseCode(code))
    .first<{ id: string; name: string; members: number }>();
}

// What an invite link points at, so the join screen can show the group's name.
groups.get("/join/:code", async (c) => {
  const user = currentUser(c);
  const group = await findByCode(c.env.DB, c.req.param("code"));
  if (!group) return c.json({ error: "That invite code doesn't match a group." }, 404);
  const member = await c.env.DB.prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?")
    .bind(group.id, user.id)
    .first();
  const preview: GroupPreview = { ...group, isMember: !!member, full: group.members >= MAX_MEMBERS };
  return c.json(preview);
});

// Join with a code. Rate limited per person so codes can't be guessed.
groups.post("/join", async (c) => {
  const user = currentUser(c);
  const { success } = await c.env.AUTH_LIMITER.limit({ key: `join:${user.id}` });
  if (!success) return c.json({ error: "Too many tries. Wait a minute and try again." }, 429);

  const body = (await c.req.json().catch(() => null)) as { code?: unknown } | null;
  const group = typeof body?.code === "string" ? await findByCode(c.env.DB, body.code) : null;
  if (!group) return c.json({ error: "That invite code doesn't match a group." }, 404);
  if (group.members >= MAX_MEMBERS) return c.json({ error: `That group is full (${MAX_MEMBERS} people).` }, 400);

  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
  )
    .bind(group.id, user.id, now())
    .run();
  return c.json({ id: group.id });
});

// A group's page: settings, invite code, this period's board and favourite snack.
groups.get("/:id", async (c) => {
  const user = currentUser(c);
  const g = await membership(c.env.DB, c.req.param("id"), user.id);
  if (!g) return c.json({ error: "Group not found." }, 404);

  const [board, favourite] = await Promise.all([
    leaderboard(c.env.DB, g),
    // Best average rating among snacks the members have checked in.
    c.env.DB.prepare(
      `SELECT s.id, s.name, s.brand, s.category_id AS category, s.status,
              AVG(c.overall) AS avg, COUNT(*) AS checkins, (${LATEST_PHOTO}) AS photoId
         FROM checkins c JOIN snacks s ON s.id = c.snack_id
        WHERE c.user_id IN (SELECT user_id FROM group_members WHERE group_id = ?1)
          AND (s.category_id IN (SELECT value FROM json_each(?2)) OR ?2 IS NULL)
        GROUP BY s.id
        ORDER BY avg DESC, checkins DESC
        LIMIT 1`,
    )
      .bind(g.id, g.categories)
      .first<GroupPage["favourite"]>(),
  ]);

  const page: GroupPage = {
    group: {
      id: g.id,
      name: g.name,
      inviteCode: g.invite_code,
      scoringMode: g.scoring_mode,
      resetPeriod: g.reset_period,
      categories: g.categories ? (JSON.parse(g.categories) as string[]) : null,
      createdAt: g.created_at,
    },
    myRole: g.role,
    periodEnd: periodEnd(g.reset_period, now()),
    board,
    favourite: favourite ?? null,
  };
  return c.json(page);
});

// Leave a group. The owner deletes it instead, so a group always has an owner.
groups.post("/:id/leave", async (c) => {
  const user = currentUser(c);
  const g = await membership(c.env.DB, c.req.param("id"), user.id);
  if (!g) return c.json({ error: "Group not found." }, 404);
  if (g.role === "owner") return c.json({ error: "You run this group. Delete it instead." }, 400);
  await c.env.DB.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").bind(g.id, user.id).run();
  return c.json({ ok: true });
});

// Delete a group (owner only). Memberships go with it; check-ins are untouched.
groups.delete("/:id", async (c) => {
  const user = currentUser(c);
  const g = await membership(c.env.DB, c.req.param("id"), user.id);
  if (!g) return c.json({ error: "Group not found." }, 404);
  if (g.role !== "owner") return c.json({ error: "Only the group's owner can delete it." }, 403);
  await c.env.DB.prepare("DELETE FROM groups WHERE id = ?").bind(g.id).run();
  return c.json({ ok: true });
});
