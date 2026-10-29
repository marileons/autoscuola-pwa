-- Additive personal presentation settings. NULL removes the override but keeps its
-- revision, preventing stale editors from recreating it after a concurrent reset.
CREATE TABLE app_home_sections_users (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 enabled_paths TEXT CHECK(enabled_paths IS NULL OR (json_valid(enabled_paths) AND json_type(enabled_paths)='array')),
 version INTEGER NOT NULL CHECK(version>=1),
 updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 updated_at TEXT NOT NULL
);
