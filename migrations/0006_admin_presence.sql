-- Optional presence metadata: older Workers ignore these nullable fields.
ALTER TABLE sessions ADD COLUMN presence_device_hash TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN presence_seen_at TEXT DEFAULT NULL;
CREATE INDEX sessions_user_presence ON sessions(user_id, presence_seen_at);
