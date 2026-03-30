BEGIN;

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT rel.relname AS table_name, con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE con.contype = 'f'
      AND nsp.nspname = 'public'
      AND rel.relname IN ('audit_logs', 'vaults', 'tenant_keys', 'documents', 'tenant_members')
      AND pg_get_constraintdef(con.oid) ILIKE '%REFERENCES tenants(id)%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
      target.table_name,
      target.constraint_name
    );
  END LOOP;
END $$;

COMMIT;
