CREATE TABLE user_employment_periods (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employment_type TEXT NOT NULL CHECK (employment_type IN ('PART_TIME', 'FULL_TIME')),
  effective_from TEXT NOT NULL CHECK (
    date(effective_from) IS NOT NULL
    AND effective_from = date(effective_from)
    AND strftime('%w', effective_from) = '1'
  ),
  created_at TEXT NOT NULL,
  created_by TEXT,
  UNIQUE (user_id, effective_from)
);

CREATE INDEX user_employment_periods_user_effective
  ON user_employment_periods(user_id, effective_from);

INSERT INTO user_employment_periods (
  id,
  user_id,
  employment_type,
  effective_from,
  created_at,
  created_by
)
SELECT
  lower(hex(randomblob(16))),
  id,
  'PART_TIME',
  '2026-08-31',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  NULL
FROM users;
