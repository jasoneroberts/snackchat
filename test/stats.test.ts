import { describe, expect, it } from "vitest";
import { weekNumber, weekStartOf } from "../shared/achievements";
import { summarise, type StatsUser } from "../worker/lib/stats";

// Wednesday 29 Oct 2026, midday UTC. Its week started Monday 26 Oct.
const NOW = Date.UTC(2026, 9, 29, 12) / 1000;
const W = weekNumber(NOW);
const inWeek = (w: number, day = 1) => weekStartOf(w) + day * 86400;

const user = (id: string, joinedWeek: number, extra: Partial<StatsUser> = {}): StatsUser => ({
  id,
  username: id,
  createdAt: inWeek(joinedWeek, 0),
  ref: null,
  checkins: 0,
  ...extra,
});

describe("summarise", () => {
  it("counts active and returning people per week, newest first", () => {
    const users = [user("old", W - 2, { checkins: 3 }), user("new", W, { ref: "pub", checkins: 1 }), user("gone", W - 1)];
    const activity = [
      { userId: "old", week: W - 2, last: inWeek(W - 2) },
      { userId: "old", week: W - 1, last: inWeek(W - 1) },
      { userId: "old", week: W, last: inWeek(W) },
      // The same person from a second source in the same week counts once.
      { userId: "old", week: W, last: inWeek(W, 2) },
      { userId: "new", week: W, last: inWeek(W) },
      { userId: "gone", week: W - 1, last: inWeek(W - 1) },
      // Someone not in the list (a demo bot) is ignored.
      { userId: "bot", week: W, last: inWeek(W) },
    ];
    const s = summarise(users, activity, new Map([[W, 4]]), NOW);

    expect(s.weeks).toHaveLength(8);
    expect(s.weeks[0]).toEqual({ weekStart: weekStartOf(W), joined: 1, active: 2, returning: 1, checkins: 4 });
    expect(s.weeks[1]).toMatchObject({ joined: 1, active: 2, returning: 1, checkins: 0 });
    expect(s.weeks[2]).toMatchObject({ joined: 1, active: 1, returning: 0 });
    expect(s.activeThisWeek).toBe(2);
    expect(s.returningThisWeek).toBe(1);
    // old and gone were active last week; only old came back this week.
    expect(s.keptFromLastWeek).toBe(1);

    expect(s.everyone.map((p) => p.username)).toEqual(["old", "new", "gone"]);
    expect(s.everyone[0]).toMatchObject({ weeksActive: 3, activeThisWeek: true, lastActive: inWeek(W, 2) });
    expect(s.everyone[2]).toMatchObject({ weeksActive: 1, activeThisWeek: false });
  });

  it("groups sign-up sources, with straight-in people last", () => {
    const users = [user("a", W), user("b", W, { ref: "pub", checkins: 2 }), user("c", W, { ref: "pub" }), user("d", W, { ref: "meta" })];
    const s = summarise(users, [{ userId: "b", week: W, last: NOW }], new Map(), NOW);
    expect(s.sources).toEqual([
      { ref: "pub", joined: 2, checkedIn: 1, activeThisWeek: 1 },
      { ref: "meta", joined: 1, checkedIn: 0, activeThisWeek: 0 },
      { ref: null, joined: 1, checkedIn: 0, activeThisWeek: 0 },
    ]);
  });
});
