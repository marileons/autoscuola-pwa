-- Additive only: existing identities, credentials and relationships are untouched.
-- Before rollback to an older Worker, block every SEGRETERIA account: older code
-- sees its underlying ISTRUTTORE role. Never reconstruct the users table.
ALTER TABLE users ADD COLUMN access_profile TEXT DEFAULT NULL
  CHECK (access_profile IS NULL OR access_profile = 'SEGRETERIA');
CREATE TABLE reserved_area_pins (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  pin_iterations INTEGER NOT NULL CHECK (pin_iterations >= 100000),
  generation TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
ALTER TABLE sessions ADD COLUMN reserved_area_until TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN reserved_area_generation TEXT DEFAULT NULL;
