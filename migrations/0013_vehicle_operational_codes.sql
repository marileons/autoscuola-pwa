-- Sigla operativa distinta da categoria, sigla partecipante e targa.
-- Nessun backfill: i veicoli precedenti restano con operational_code NULL.
ALTER TABLE calendar_vehicles ADD COLUMN operational_code TEXT DEFAULT NULL CHECK(operational_code IS NULL OR (length(operational_code) BETWEEN 1 AND 12 AND operational_code=upper(trim(operational_code)) AND operational_code NOT GLOB '*[^A-Z0-9-]*'));
CREATE TABLE calendar_event_operational_resources (
 event_id TEXT NOT NULL REFERENCES calendar_events(id),
 resource_key TEXT NOT NULL,
 code_snapshot TEXT,
 vehicle_id TEXT REFERENCES calendar_vehicles(id),
 vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('Auto','Moto')),
 PRIMARY KEY(event_id,resource_key),
 CHECK(code_snapshot IS NOT NULL OR vehicle_id IS NOT NULL)
);
CREATE INDEX calendar_operational_resources_code ON calendar_event_operational_resources(code_snapshot,vehicle_type,event_id);
CREATE TABLE calendar_operational_capacity_guard(id INTEGER PRIMARY KEY CHECK(id=1),ok INTEGER NOT NULL CHECK(ok=1));
CREATE TRIGGER calendar_operational_capacity_reject BEFORE INSERT ON calendar_operational_capacity_guard WHEN NEW.ok<>1 BEGIN SELECT RAISE(ABORT,'CALENDAR_OPERATIONAL_CAPACITY'); END;
