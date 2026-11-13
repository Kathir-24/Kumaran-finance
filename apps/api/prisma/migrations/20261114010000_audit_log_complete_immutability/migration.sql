-- Enforce complete database-level append-only immutability for AuditLog
-- Strictly prevents UPDATE, DELETE, and TRUNCATE for all database users and sessions

-- 1. Upgrade trigger function to reject both UPDATE and DELETE
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'AuditLog records are strictly append-only and cannot be updated.';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AuditLog records are strictly append-only and cannot be deleted.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 2. Ensure row-level mutation trigger fires BEFORE UPDATE OR DELETE
DROP TRIGGER IF EXISTS trg_prevent_audit_log_mutation ON "AuditLog";

CREATE TRIGGER trg_prevent_audit_log_mutation
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- Ensure mutation trigger ALWAYS fires even if replica role or session replication settings are modified
ALTER TABLE "AuditLog" ENABLE ALWAYS TRIGGER trg_prevent_audit_log_mutation;

-- 3. Statement-level trigger to strictly block TRUNCATE on AuditLog
CREATE OR REPLACE FUNCTION prevent_audit_log_truncate()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog records are strictly append-only and cannot be truncated.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_truncate ON "AuditLog";

CREATE TRIGGER trg_prevent_audit_log_truncate
BEFORE TRUNCATE ON "AuditLog"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_log_truncate();

-- Ensure truncate trigger ALWAYS fires
ALTER TABLE "AuditLog" ENABLE ALWAYS TRIGGER trg_prevent_audit_log_truncate;

-- 4. Revoke mutation privileges from PUBLIC
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM PUBLIC;
