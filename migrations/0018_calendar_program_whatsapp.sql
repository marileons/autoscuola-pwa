-- Additive only. No existing account is opted in; old publications remain unclassified.
CREATE TABLE calendar_program_whatsapp_preferences (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 receives_whatsapp INTEGER NOT NULL DEFAULT 0 CHECK(receives_whatsapp IN(0,1)),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 updated_by TEXT NOT NULL REFERENCES users(id), updated_at TEXT NOT NULL
);
ALTER TABLE calendar_program_publications ADD COLUMN delivery_kind TEXT
 CHECK(delivery_kind IS NULL OR delivery_kind IN('PROVVISORIO','DEFINITIVO'));
