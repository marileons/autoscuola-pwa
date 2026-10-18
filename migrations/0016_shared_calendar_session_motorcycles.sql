-- Selection metadata only; existing event-vehicle relations remain authoritative. NULL preserves historical candidate reservations.
ALTER TABLE calendar_exam_details ADD COLUMN session_motorcycles TEXT CHECK(session_motorcycles IS NULL OR (exam_type='MOTO' AND json_valid(session_motorcycles) AND json_type(session_motorcycles)='array'));
