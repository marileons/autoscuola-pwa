-- Additive only. Existing descriptive names and identities are left untouched.
ALTER TABLE calendar_event_participants ADD COLUMN surname TEXT;
ALTER TABLE calendar_event_participants ADD COLUMN given_name TEXT;
