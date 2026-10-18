-- Nullable organizational metadata; no historical reclassification.
ALTER TABLE calendar_events ADD COLUMN exam_purpose TEXT CHECK(exam_purpose IS NULL OR (event_type='ESAME' AND exam_purpose IN('conseguimento','esame-revisione','esame-esperimento')));
-- Scope of newly published documents; previous publications remain unchanged.
ALTER TABLE calendar_program_publications ADD COLUMN exam_only INTEGER CHECK(exam_only IS NULL OR exam_only=1);
