-- Externally anchored checkpoints of audit-chain heads. Periodically we record
-- {scope, head_seq, head_hash} and timestamp its hash via an RFC 3161 TSA. This
-- closes the newest-suffix-truncation gap the internal chain cannot detect: a
-- truncated chain verifies as VALID internally, but cannot be behind an anchored
-- head.
--
-- Runs before the runtime-role grants (init/090_runtime_role.sh -> 060_runtime_role.sql)
-- so audit_checkpoints is covered by the GRANT ON ALL TABLES for vault_app; that
-- script then REVOKEs UPDATE/DELETE to keep this table append-only.
BEGIN;

CREATE TABLE IF NOT EXISTS audit_checkpoints (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  scope varchar(64) NOT NULL,
  head_seq bigint NOT NULL,
  head_hash char(64) NOT NULL,
  -- sha256 over the canonical {scope, head_seq, head_hash}; the value timestamped.
  checkpoint_hash char(64) NOT NULL,
  -- TIMESTAMPED | SIMULATED | FAILED
  status varchar(20) NOT NULL,
  timestamp_token_b64 text NULL,
  tsa_url varchar(255) NULL,
  tsa_serial varchar(120) NULL,
  timestamped_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_checkpoints_scope_created_at
  ON audit_checkpoints (scope, created_at);

COMMIT;
