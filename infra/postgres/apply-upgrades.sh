#!/bin/sh
# Idempotent upgrade path for both existing volumes and fresh installations.
set -eu

: "${PGHOST:=postgres}"
: "${PGPORT:=5432}"
: "${PGDATABASE:=${POSTGRES_DB:-vault}}"
: "${PGUSER:=${POSTGRES_USER:-vault}}"
: "${APP_DB_USER:=vault_app}"
: "${APP_DB_PASSWORD:=vault_app}"

base=/opt/securechain-postgres
psql -v ON_ERROR_STOP=1 -f "$base/init/040_audit_schema_version.sql"
psql -v ON_ERROR_STOP=1 -f "$base/init/050_audit_append_only.sql"
psql -v ON_ERROR_STOP=1 -f "$base/init/055_anchor_merkle.sql"
psql -v ON_ERROR_STOP=1 -f "$base/init/056_audit_checkpoints.sql"
psql -v ON_ERROR_STOP=1 \
  --set=app_user="$APP_DB_USER" \
  --set=app_password="$APP_DB_PASSWORD" \
  --file="$base/060_runtime_role.sql"
