-- Keeping an eye on the app: errors (from people's phones and from the
-- Worker) and a record of what admins changed.

CREATE TABLE error_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL CHECK (source IN ('client', 'server')),
  message     TEXT NOT NULL,
  detail      TEXT,
  path        TEXT,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX error_log_created ON error_log (created_at);

CREATE TABLE admin_audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  admin_name  TEXT NOT NULL,
  method      TEXT NOT NULL,
  path        TEXT NOT NULL,
  status      INTEGER NOT NULL,
  detail      TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX admin_audit_created ON admin_audit_log (created_at);
