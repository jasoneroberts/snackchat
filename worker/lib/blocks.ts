// Blocking works both ways: neither person sees the other's check-ins.

/** SQL that's true when the viewer and the author have blocked each other either way. */
export const blockedEitherWay = (viewer: string, author: string) =>
  `EXISTS (SELECT 1 FROM blocks bl WHERE (bl.blocker_id = ${viewer} AND bl.blocked_id = ${author})
                                      OR (bl.blocker_id = ${author} AND bl.blocked_id = ${viewer}))`;
