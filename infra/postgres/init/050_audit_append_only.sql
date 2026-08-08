-- Enforce append-only semantics for ordinary SQL, including the application
-- connection. A database owner/superuser can still disable triggers; protect
-- those credentials operationally and use external checkpoints for that threat.
BEGIN;

CREATE OR REPLACE FUNCTION reject_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is forbidden', TG_OP
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation();

-- TRUNCATE does not fire row triggers. Revoke it from non-owner roles; the
-- deployment must keep the owner credential out of the application runtime.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM PUBLIC;

COMMIT;
