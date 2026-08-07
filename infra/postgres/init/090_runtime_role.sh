#!/bin/sh
set -eu

: "${APP_DB_USER:=vault_app}"
: "${APP_DB_PASSWORD:=vault_app}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=app_user="$APP_DB_USER" \
  --set=app_password="$APP_DB_PASSWORD" \
  --file=/opt/securechain-postgres/060_runtime_role.sql
