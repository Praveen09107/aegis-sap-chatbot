-- Migration 010: Link feedback_events to the Quick Entry that sourced the answer
-- (IMPL_25 Endpoint 12 / IMPL_29 Section 3.1 — Quick Entry feedback summary).
--
-- IMPL_25/IMPL_29 both assume a `feedback` table with `source_form_entry_id`
-- and `rating` columns. The real table (from the original build) is
-- `feedback_events`, with a `feedback_signal` column (not `rating`) and no
-- `source_form_entry_id` at all. IMPL_29 Section 3.1 itself notes this column
-- "requires migration (IMPL_28 Section 5.3)" — IMPL_28 (screenshot vision)
-- hasn't been built yet, and populating this column on feedback submission
-- is that session's responsibility (the WebSocket handler needs to know
-- which citation source is a form entry). Adding the column now so
-- GET /api/admin/knowledge-entries/{id}/feedback-summary is queryable —
-- it will correctly report zero counts until the write side exists.

ALTER TABLE feedback_events
  ADD COLUMN source_form_entry_id UUID NULL REFERENCES knowledge_form_entries (id);

CREATE INDEX idx_feedback_events_source_form_entry ON feedback_events (source_form_entry_id)
  WHERE source_form_entry_id IS NOT NULL;
