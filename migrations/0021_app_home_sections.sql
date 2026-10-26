-- Additive global Home presentation settings only. No existing records are changed.
-- An absent row means AUTO and MOTO. A missing table is a deployment error.
CREATE TABLE app_home_sections (
 id INTEGER PRIMARY KEY CHECK(id=1),
 enabled_paths TEXT NOT NULL CHECK(json_valid(enabled_paths) AND json_type(enabled_paths)='array'),
 version INTEGER NOT NULL CHECK(version>=1),
 updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 updated_at TEXT NOT NULL
);
