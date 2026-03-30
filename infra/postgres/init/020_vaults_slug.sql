BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'vaults'
  ) THEN
    ALTER TABLE vaults
      ADD COLUMN IF NOT EXISTS slug varchar(120);

    UPDATE vaults
    SET slug = lower(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g'))
    WHERE slug IS NULL OR slug = '';

    ALTER TABLE vaults
      ALTER COLUMN slug SET NOT NULL;
  END IF;
END $$;

-- 4) Índice único por tenant + slug
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'vaults'
  ) AND NOT EXISTS (
    SELECT 1
    FROM   pg_indexes
    WHERE  schemaname = current_schema()
    AND    indexname = 'uq_vaults_tenant_slug'
  ) THEN
    CREATE UNIQUE INDEX uq_vaults_tenant_slug ON vaults (tenant_id, slug);
  END IF;
END $$;

COMMIT;
