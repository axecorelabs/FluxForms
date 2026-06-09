-- Drop low-cardinality single-column status index (not selective enough to be useful)
DROP INDEX IF EXISTS "forms_status_idx";

-- Composite index for active-forms count: WHERE creator_id = X AND status = Y
CREATE INDEX IF NOT EXISTS "forms_creator_id_status_idx" ON "forms"("creator_id", "status");

-- Composite index for response trend query: WHERE form_id = X AND submitted_at >= Y
CREATE INDEX IF NOT EXISTS "responses_form_id_submitted_at_idx" ON "responses"("form_id", "submitted_at");
