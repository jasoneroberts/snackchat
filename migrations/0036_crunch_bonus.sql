-- Crunch bonus, backdated. From now on a check-in of a crunchy snack type
-- (crisps, nuts, popcorn, crackers: CRUNCHY_TYPES in shared/catalogue.ts),
-- or of health food given a Crunch score, gets an extra 'crunch' line in
-- points_ledger: +3 on a first try, +1 on a repeat. This gives every existing check-in of those types the same line,
-- dated at the check-in's own time so weekly and monthly tables move too.
--
-- - Works from the check-in's 'new_snack' or 'repeat' line, so a check-in
--   that earned nothing (over the daily cap) gets no bonus either.
-- - Check-ins with scored = 0 (Jase's from before launch) get the line too,
--   but boards ignore them, so they still count for nothing.
-- - Health food only had the Crunch slider from this change on, so no old
--   health food check-in has a Crunch score and none get the bonus here.
-- - Safe to run twice: a check-in that already has a 'crunch' line is skipped.
-- - To undo: DELETE FROM points_ledger WHERE reason = 'crunch';
INSERT INTO points_ledger (user_id, checkin_id, reason, points, created_at)
SELECT pl.user_id, pl.checkin_id, 'crunch',
       CASE pl.reason WHEN 'new_snack' THEN 3 ELSE 1 END,
       pl.created_at
  FROM points_ledger pl
  JOIN checkins c ON c.id = pl.checkin_id
  JOIN snacks s ON s.id = c.snack_id
 WHERE pl.reason IN ('new_snack', 'repeat')
   AND (s.category_id IN ('crisps', 'nuts', 'popcorn', 'crackers')
        OR (s.category_id = 'healthy'
            AND EXISTS (SELECT 1 FROM checkin_attributes a
                         WHERE a.checkin_id = pl.checkin_id AND a.attribute = 'crunch' AND a.value > 0)))
   AND NOT EXISTS (SELECT 1 FROM points_ledger x WHERE x.checkin_id = pl.checkin_id AND x.reason = 'crunch');
