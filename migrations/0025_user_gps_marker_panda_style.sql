-- Keep the existing account style as the fallback for older editions.
ALTER TABLE users ADD COLUMN gps_marker_panda_style TEXT DEFAULT NULL
 CHECK (gps_marker_panda_style IN ('panda-yellow', 'panda-striped'));
