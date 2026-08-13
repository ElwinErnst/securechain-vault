-- Persistent anti-replay store for Zero Trust internal requests.
--
-- Replaces a per-instance in-memory Map in the vault-api JwtAuthGuard so replay
-- detection is correct across restarts and horizontally-scaled instances.
-- A row exists only for the short replay window (zt.maxClockSkewMs) and is
-- pruned by the app afterwards.
--
-- Runs before the runtime-role grants (init/090_runtime_role.sh ->
-- 060_runtime_role.sql), so replay_nonces is covered by the
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES for vault_app. This table
-- is NOT append-only (the app deletes expired rows), so it is intentionally
-- left out of the UPDATE/DELETE revokes.

CREATE TABLE IF NOT EXISTS replay_nonces (
  key        varchar(255) NOT NULL,
  expires_at timestamptz  NOT NULL,
  CONSTRAINT pk_replay_nonces PRIMARY KEY (key)
);

CREATE INDEX IF NOT EXISTS idx_replay_nonces_expires_at
  ON replay_nonces (expires_at);
