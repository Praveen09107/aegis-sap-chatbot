-- Migration 006: Grant SELECT on audit_log to aegis_app_role
-- Depends on: 004_initial_data.sql (audit_log INSERT-only grant)
--
-- Migration 004 granted INSERT only and explicitly revoked UPDATE/DELETE to
-- enforce the append-only rule (CLAUDE.md: "audit_log is append-only. No
-- UPDATE or DELETE, ever."). SELECT was never granted at all, which is a
-- stricter reading than the append-only rule requires — append-only means
-- writes are insert-only, not that the table is unreadable. The Session 21
-- admin audit-trail endpoint (GET /admin/audit-trail) needs to read this
-- table; append-only and readable are not in conflict.

GRANT SELECT ON TABLE audit_log TO aegis_app_role;
