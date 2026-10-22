-- Lad mode: which voice the app talks to this person in, 'grownup' or 'lad'.
-- NULL means they haven't picked yet, so the app asks them once.
ALTER TABLE users ADD COLUMN voice TEXT CHECK (voice IN ('grownup', 'lad'));
