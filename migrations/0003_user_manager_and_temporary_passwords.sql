-- Migrazione esclusivamente additiva: non copia, rimappa o aggiorna record esistenti.
-- role resta intatto per compatibilità di rollback; authorization_role è il ruolo effettivo.
ALTER TABLE users ADD COLUMN authorization_role TEXT
  CHECK (authorization_role IS NULL OR authorization_role IN ('ADMIN', 'USER_MANAGER', 'ISTRUTTORE'));
ALTER TABLE users ADD COLUMN is_primary_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_primary_admin IN (0, 1));
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1));
ALTER TABLE users ADD COLUMN temporary_password_expires_at TEXT;
ALTER TABLE users ADD COLUMN temporary_password_used_at TEXT;
ALTER TABLE users ADD COLUMN password_reset_at TEXT;
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1 CHECK (session_version >= 1);
CREATE UNIQUE INDEX users_single_primary_admin ON users(is_primary_admin) WHERE is_primary_admin = 1;
CREATE INDEX users_authorization_role_active ON users(authorization_role, active);
ALTER TABLE sessions ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1 CHECK (session_version >= 1);
ALTER TABLE sessions ADD COLUMN purpose TEXT NOT NULL DEFAULT 'NORMAL' CHECK (purpose IN ('NORMAL', 'PASSWORD_CHANGE'));
CREATE TABLE user_management_audit (
  id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS', 'DENIED', 'FAILED')),
  reason_code TEXT NOT NULL, request_id TEXT NOT NULL
);
CREATE INDEX user_management_audit_occurred_at ON user_management_audit(occurred_at);
CREATE INDEX user_management_audit_actor ON user_management_audit(actor_user_id, occurred_at);
CREATE TABLE security_throttles (
  scope TEXT NOT NULL, key_hash TEXT NOT NULL, failure_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL, blocked_until TEXT, updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, key_hash)
);
CREATE INDEX security_throttles_updated_at ON security_throttles(updated_at);
