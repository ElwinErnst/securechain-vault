BEGIN;

-- 1) Agregar columna slug si no existe
ALTER TABLE vaults
  ADD COLUMN IF NOT EXISTS slug varchar(120);

-- 2) Backfill slug si quedó NULL/vacío (para rows existentes)
UPDATE vaults
SET slug = lower(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL OR slug = '';

-- 3) Asegurar NOT NULL (si hay datos viejos sin name, esto podría fallar)
ALTER TABLE vaults
  ALTER COLUMN slug SET NOT NULL;

-- 4) Índice único por tenant + slug
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_indexes
    WHERE  schemaname = current_schema()
    AND    indexname = 'uq_vaults_tenant_slug'
  ) THEN
    CREATE UNIQUE INDEX uq_vaults_tenant_slug ON vaults (tenant_id, slug);
  END IF;
END $$;

COMMIT;
