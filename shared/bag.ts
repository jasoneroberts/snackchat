// "Bag it" from a check-in: save a snack you spotted in someone's check-in to
// try later. When you then check it in for the first time, the person whose
// check-in put you onto it earns BAG_POINTS.tried (worker/lib/bagTips.ts).

export const BAG_POINTS = {
  tried: 10, // someone bagged a snack from your check-in, then checked it in
  // Paid for at most this many tries a day per person, so two mates can't
  // farm it. Tries past that still count (and for the chieves), for 0 points.
  perDay: 5,
  // Whether these points count on the people and squad points tables, like
  // invite points (INVITE_POINTS.onBoards). They're always on your total.
  onBoards: true,
} as const;
