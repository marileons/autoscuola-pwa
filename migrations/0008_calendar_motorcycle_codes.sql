-- Calendar-only extension. No changes to existing tables or records.
CREATE TABLE IF NOT EXISTS calendar_motorcycle_codes(
 id TEXT PRIMARY KEY,
 code TEXT NOT NULL,
 normalized_code TEXT NOT NULL UNIQUE,
 sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order>=0),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS calendar_motorcycle_codes_order ON calendar_motorcycle_codes(active,sort_order,id);
CREATE TABLE IF NOT EXISTS calendar_participant_motorcycles(
 event_id TEXT NOT NULL,
 participant_key TEXT NOT NULL,
 code_id TEXT REFERENCES calendar_motorcycle_codes(id),
 code_snapshot TEXT NOT NULL DEFAULT '',
 vehicle_id TEXT REFERENCES calendar_vehicles(id),
 PRIMARY KEY(event_id,participant_key),
 UNIQUE(event_id,vehicle_id),
 FOREIGN KEY(event_id,participant_key) REFERENCES calendar_event_participants(event_id,participant_key)
);
CREATE INDEX IF NOT EXISTS calendar_participant_motorcycles_code ON calendar_participant_motorcycles(code_id);
CREATE TABLE IF NOT EXISTS calendar_motorcycle_write_guard(
 id INTEGER PRIMARY KEY CHECK(id=1),
 codes_ok INTEGER NOT NULL CONSTRAINT CALENDAR_MOTORCYCLE_CODE CHECK(codes_ok=1)
);
-- Stable IDs and conflict handling preserve edits if the seed is run again.
-- Rollback: disable the calendar and assess new data before using an older
-- Worker. The FK deliberately prevents old writes from silently losing assignments.
INSERT INTO calendar_motorcycle_codes(id,code,normalized_code,sort_order,created_at,updated_at) VALUES
 ('moto-code-c','C','C',10,'1970-01-01T00:00:00.000Z','1970-01-01T00:00:00.000Z'),
 ('moto-code-m','M','M',20,'1970-01-01T00:00:00.000Z','1970-01-01T00:00:00.000Z'),
 ('moto-code-s','S','S',30,'1970-01-01T00:00:00.000Z','1970-01-01T00:00:00.000Z'),
 ('moto-code-sn','SN','SN',40,'1970-01-01T00:00:00.000Z','1970-01-01T00:00:00.000Z'),
 ('moto-code-sh','SH','SH',50,'1970-01-01T00:00:00.000Z','1970-01-01T00:00:00.000Z'),
 ('moto-code-gsx','GSX','GSX',60,'1970-01-01T00:00:00.000Z','1970-01-01T00:00:00.000Z'),
 ('moto-code-k2','K2','K2',70,'1970-01-01T00:00:00.000Z','1970-01-01T00:00:00.000Z'),
 ('moto-code-k','K','K',80,'1970-01-01T00:00:00.000Z','1970-01-01T00:00:00.000Z')
ON CONFLICT DO NOTHING;
