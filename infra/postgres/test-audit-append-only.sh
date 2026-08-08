#!/bin/sh
# Postgres-backed smoke test for the runtime-role boundary. Run after db:upgrade.
set -eu

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGDATABASE:=${POSTGRES_DB:-vault}}"
: "${PGUSER:=${POSTGRES_USER:-vault}}"
: "${PGPASSWORD:=${POSTGRES_PASSWORD:-vault}}"
: "${APP_DB_USER:=vault_app}"
: "${APP_DB_PASSWORD:=vault_app}"

scope="append-only-test-$$"
app_psql() {
  PGPASSWORD="$APP_DB_PASSWORD" psql -X -v ON_ERROR_STOP=1 \
    -U "$APP_DB_USER" -d "$PGDATABASE" -h "$PGHOST" -p "$PGPORT" "$@"
}
owner_psql() {
  PGPASSWORD="$PGPASSWORD" psql -X -v ON_ERROR_STOP=1 \
    -U "$PGUSER" -d "$PGDATABASE" -h "$PGHOST" -p "$PGPORT" "$@"
}
must_fail() {
  label=$1
  shift
  if app_psql "$@" >/dev/null 2>&1; then
    echo "FAIL: runtime role was allowed to $label" >&2
    exit 1
  fi
}

app_psql -c "INSERT INTO audit_logs
  (scope, seq, action, resource_type, outcome, http_status, http_method,
   http_path, event_hash, chain_hash)
  VALUES ('$scope', 1, 'TEST', 'test', 'SUCCESS', 200, 'GET', '/test',
          repeat('0',64), repeat('1',64));" >/dev/null

must_fail UPDATE -c "UPDATE audit_logs SET action='TAMPERED' WHERE scope='$scope'"
must_fail DELETE -c "DELETE FROM audit_logs WHERE scope='$scope'"
must_fail TRUNCATE -c "TRUNCATE audit_logs"

# Cleanup requires the owner and deliberately demonstrates the trust boundary.
owner_psql <<SQL >/dev/null
ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_append_only;
DELETE FROM audit_logs WHERE scope = '$scope';
ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_append_only;
SQL

echo "PASS: vault_app can insert but cannot update, delete, or truncate audit_logs"
