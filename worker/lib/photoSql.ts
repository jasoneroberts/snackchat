// Snack `s`'s main picture, as a subquery: use it as `(${LATEST_PHOTO}) AS photoId`
// in a query over `snacks s`. It's the photo an admin picked (s.cover_photo_id)
// if that's still showing, otherwise the newest visible photo from someone with
// a public profile.
export const LATEST_PHOTO = `SELECT p.id FROM photos p
    JOIN checkins pc ON pc.id = p.checkin_id
    JOIN users pu ON pu.id = pc.user_id
   WHERE pc.snack_id = s.id AND p.status = 'visible' AND pu.is_private = 0
   ORDER BY p.id = s.cover_photo_id DESC, p.created_at DESC LIMIT 1`;
