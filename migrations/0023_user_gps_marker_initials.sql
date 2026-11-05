-- Additive account presentation only. No backfill or user record updates.
ALTER TABLE users ADD COLUMN gps_marker_initials TEXT DEFAULT NULL
 CHECK (gps_marker_initials IS NULL OR
   (typeof(gps_marker_initials)='text' AND length(gps_marker_initials)=2
    AND gps_marker_initials NOT GLOB '*[^A-Z]*'));
