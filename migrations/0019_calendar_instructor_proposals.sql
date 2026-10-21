-- Additive: proposals are organizational requests, never resource bookings.
CREATE TABLE calendar_instructor_proposals (
 id TEXT PRIMARY KEY,
 request_key TEXT NOT NULL,
 instructor_id TEXT NOT NULL REFERENCES users(id),
 site_id TEXT NOT NULL REFERENCES calendar_sites(id),
 student_name TEXT NOT NULL,
 starts_at TEXT NOT NULL,
 ends_at TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('auto','moto')),
 motorcycle_code TEXT NOT NULL DEFAULT '',
 note TEXT NOT NULL DEFAULT '',
 state TEXT NOT NULL DEFAULT 'IN ATTESA' CHECK(state IN ('IN ATTESA','INSERITA','NON ACCOLTA')),
 version INTEGER NOT NULL DEFAULT 1,
 event_id TEXT UNIQUE REFERENCES calendar_events(id),
 reason TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL REFERENCES users(id),
 UNIQUE(instructor_id,request_key)
);
CREATE INDEX calendar_instructor_proposals_site_state ON calendar_instructor_proposals(site_id,state,created_at);
