-- Private organizational reminders: no existing records are changed.
CREATE TABLE calendar_secretary_reminder_catalog (
 id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES calendar_sites(id),
 code TEXT NOT NULL, normalized_code TEXT NOT NULL, description TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)), version INTEGER NOT NULL DEFAULT 1,
 UNIQUE(site_id,normalized_code)
);
CREATE TABLE calendar_secretary_reminders (
 event_id TEXT NOT NULL REFERENCES calendar_events(id), participant_key TEXT NOT NULL,
 items TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(items)), version INTEGER NOT NULL DEFAULT 1,
 updated_by TEXT NOT NULL REFERENCES users(id), updated_at TEXT NOT NULL,
 PRIMARY KEY(event_id,participant_key)
);
CREATE TABLE calendar_secretary_reminder_guard (
 id INTEGER PRIMARY KEY CHECK(id=1), ok INTEGER NOT NULL CONSTRAINT CALENDAR_REMINDER_CONFLICT CHECK(ok=1)
);
