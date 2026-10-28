// Nudging people who've gone quiet. Once a day (the hourly cron, at
// REMINDER_HOUR_UTC) everyone with notifications on who hasn't checked in
// for REMIND_AFTER_DAYS gets a push. If they still don't, one follow-up comes
// FOLLOW_UP_DAYS later, then nothing more until their next check-in.

import type { Env } from "../env";
import { REMIND_AFTER_DAYS } from "../../shared/reminders";
import { pushToUser } from "./notify";

export { REMIND_AFTER_DAYS };

export const FOLLOW_UP_DAYS = 7;
export const MAX_REMINDERS = 2;
// 18:00 UTC is 6pm in winter and 7pm in summer in the UK: snack o'clock.
export const REMINDER_HOUR_UTC = 18;

const DAY = 86400;

/** The push text, in the person's own voice. `days` is null if they've never checked in. */
export function reminderMessage(voice: string | null, days: number | null): { title: string; body: string } {
  if (voice === "lad") {
    return days === null
      ? { title: "Oi, you've not logged a thing", body: "Get your first snack logged and get yourself on the Table." }
      : { title: "Oi, where've you been?", body: `${days} days without a check-in. Get something logged and get back on the Table.` };
  }
  return days === null
    ? { title: "Had a snack lately?", body: "You haven't logged one yet. Rate your first snack and get on the Table." }
    : { title: "Had any good snacks lately?", body: `It's been ${days} days since your last check-in. Rate something you've had and climb the Table.` };
}

/**
 * Who's due a reminder now. "last" is their latest check-in, or when they
 * joined if they've never checked in. Due if quiet for REMIND_AFTER_DAYS and
 * either not reminded since they were last active, or it's been
 * FOLLOW_UP_DAYS since the first reminder and they've had fewer than
 * MAX_REMINDERS. Only people with a phone signed up for notifications.
 */
export const DUE_SQL = `
  SELECT id, voice, last_checkin, COALESCE(last_checkin, created_at) AS last, reminded_at, reminder_count FROM (
    SELECT u.id, u.voice, u.created_at, u.reminded_at, u.reminder_count,
           (SELECT MAX(c.created_at) FROM checkins c WHERE c.user_id = u.id) AS last_checkin
      FROM users u
     WHERE u.reminders = 1 AND u.id NOT LIKE 'demo-%'
       AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)
  )
  WHERE COALESCE(last_checkin, created_at) <= ?1 - ${REMIND_AFTER_DAYS} * ${DAY}
    AND (reminded_at IS NULL OR reminded_at < COALESCE(last_checkin, created_at)
         OR (reminder_count < ${MAX_REMINDERS} AND reminded_at <= ?1 - ${FOLLOW_UP_DAYS} * ${DAY}))`;

interface Due {
  id: string;
  voice: string | null;
  last: number;
  last_checkin: number | null;
  reminded_at: number | null;
  reminder_count: number;
}

/** Send today's reminders. Returns how many people were sent one. */
export async function sendReminders(env: Env, origin: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<number> {
  const { results } = await env.DB.prepare(DUE_SQL).bind(nowSeconds).all<Due>();
  let reminded = 0;
  for (const u of results) {
    const days = u.last_checkin === null ? null : Math.floor((nowSeconds - u.last_checkin) / DAY);
    const sent = await pushToUser(env, origin, u.id, { kind: "reminder", url: "/checkin", ...reminderMessage(u.voice, days) });
    // Count it even if no phone took it, so a dead subscription can't cause a daily retry.
    const first = u.reminded_at === null || u.reminded_at < u.last;
    await env.DB.prepare("UPDATE users SET reminded_at = ?, reminder_count = ? WHERE id = ?")
      .bind(nowSeconds, first ? 1 : u.reminder_count + 1, u.id)
      .run();
    if (sent) reminded++;
  }
  return reminded;
}
