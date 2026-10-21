-- Additive only: old rows keep their state, data and event links.
ALTER TABLE calendar_instructor_proposals ADD COLUMN withdrawn_at TEXT;
ALTER TABLE calendar_instructor_proposals ADD COLUMN personal_archived INTEGER NOT NULL DEFAULT 0 CHECK(personal_archived IN(0,1));
