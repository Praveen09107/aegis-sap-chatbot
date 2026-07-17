-- Migration 009: Reverse link from knowledge_gap_events to the Quick Entry
-- that addressed it (IMPL_26 Stage A13).
--
-- Migration 007 already added knowledge_form_entries.gap_id (forward link,
-- entry -> gap it was created from). IMPL_26's process_form_entry task also
-- needs to write the reverse link when an entry finishes processing, but
-- knowledge_gap_events (migration 002) was never given the columns for it.
-- Adding them here completes a link both IMPL_24 and IMPL_26 already assumed
-- existed on both sides.

ALTER TABLE knowledge_gap_events
  ADD COLUMN addressed_by_entry_id UUID NULL REFERENCES knowledge_form_entries (id),
  ADD COLUMN addressed_at TIMESTAMPTZ NULL;

CREATE INDEX idx_gap_events_addressed_by ON knowledge_gap_events (addressed_by_entry_id)
  WHERE addressed_by_entry_id IS NOT NULL;
