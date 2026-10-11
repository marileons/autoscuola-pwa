-- Additive operational state only. Existing users and calendar records are untouched.
CREATE TABLE IF NOT EXISTS calendar_operational_state (
 id INTEGER PRIMARY KEY CHECK(id=1),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 updated_at TEXT,
 updated_by TEXT
);
INSERT OR IGNORE INTO calendar_operational_state(id,enabled,version) VALUES(1,1,1);
