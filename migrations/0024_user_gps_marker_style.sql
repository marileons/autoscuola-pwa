-- Additive account presentation; existing accounts keep the dark marker.
ALTER TABLE users ADD COLUMN gps_marker_style TEXT NOT NULL DEFAULT 'dark'
 CHECK (gps_marker_style IN ('dark', 'rose'));
