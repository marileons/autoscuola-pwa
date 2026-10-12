-- Additive organizational metadata; no historical data is rewritten.
CREATE TABLE calendar_coordination_changes(seq INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL REFERENCES calendar_events(id),event_version INTEGER NOT NULL,revision INTEGER NOT NULL,actor_id TEXT NOT NULL,actor_name TEXT NOT NULL,site_id TEXT NOT NULL REFERENCES calendar_sites(id),before_json TEXT,after_json TEXT NOT NULL,recipients_json TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(event_id,event_version));
CREATE INDEX calendar_coordination_event ON calendar_coordination_changes(event_id,revision);
CREATE TABLE calendar_coordination_responses(event_id TEXT NOT NULL REFERENCES calendar_events(id),user_id TEXT NOT NULL,name TEXT NOT NULL,revision INTEGER NOT NULL,event_version INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN('VISTO','DA CHIARIRE')),reason TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,PRIMARY KEY(event_id,user_id,revision));
CREATE TABLE calendar_coordination_reads(change_seq INTEGER NOT NULL REFERENCES calendar_coordination_changes(seq),user_id TEXT NOT NULL,read_at TEXT NOT NULL,PRIMARY KEY(change_seq,user_id));
CREATE TABLE calendar_coordination_status(event_id TEXT PRIMARY KEY REFERENCES calendar_events(id),state TEXT NOT NULL CHECK(state IN('PROGRAMMATO','CONFERMATO','SVOLTO','ASSENTE','ANNULLATO')),event_version INTEGER NOT NULL,series_id TEXT);
CREATE TABLE calendar_resource_availability(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN('instructor','vehicle')),resource_id TEXT NOT NULL,resource_name TEXT NOT NULL,site_id TEXT NOT NULL REFERENCES calendar_sites(id),starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,reason TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN(0,1)),actor_id TEXT NOT NULL,updated_at TEXT NOT NULL,CHECK(starts_at<ends_at));
CREATE INDEX calendar_availability_overlap ON calendar_resource_availability(kind,resource_id,starts_at,ends_at);
CREATE TABLE calendar_coordination_audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT NOT NULL,actor_name TEXT NOT NULL,action TEXT NOT NULL,entity_id TEXT NOT NULL,site_id TEXT NOT NULL,version INTEGER NOT NULL,snapshot TEXT NOT NULL,created_at TEXT NOT NULL);
-- Constraints are checked in the same D1 batch as every resource assignment.
CREATE TABLE calendar_coordination_guard(id INTEGER PRIMARY KEY CHECK(id=1),ok INTEGER NOT NULL CONSTRAINT CALENDAR_COORDINATION_CONFLICT CHECK(ok=1));

-- Immutable, versioned publications share the organizational cache and Audit.
CREATE TABLE calendar_program_publications(id INTEGER PRIMARY KEY AUTOINCREMENT,site_id TEXT NOT NULL REFERENCES calendar_sites(id),site_name TEXT NOT NULL DEFAULT '',date TEXT NOT NULL,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,version INTEGER NOT NULL,snapshot TEXT NOT NULL,modified INTEGER NOT NULL DEFAULT 0,actor_id TEXT NOT NULL,actor_name TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(site_id,date,version));
CREATE TABLE calendar_program_instructors(program_id INTEGER NOT NULL REFERENCES calendar_program_publications(id),user_id TEXT NOT NULL,name TEXT NOT NULL,entries TEXT NOT NULL,PRIMARY KEY(program_id,user_id));
CREATE TABLE calendar_program_responses(program_id INTEGER NOT NULL REFERENCES calendar_program_publications(id),user_id TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('VISTO','DA CHIARIRE')),reason TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,PRIMARY KEY(program_id,user_id));
CREATE INDEX calendar_program_site_date ON calendar_program_publications(site_id,date,version);

CREATE INDEX calendar_coordination_audit_actor_time ON calendar_coordination_audit(actor_id,created_at);
