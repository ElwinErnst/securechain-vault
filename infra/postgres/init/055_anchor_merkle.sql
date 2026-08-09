-- Merkle-batch document anchoring. Instead of anchoring each document
-- separately, documents are batched into a Merkle tree and only the root is
-- anchored externally (RFC 3161 timestamp). Each document keeps an inclusion
-- proof linking its leaf to the batch root.
--
-- Runs before the runtime-role grants (init/090_runtime_role.sh -> 060_runtime_role.sql)
-- so anchor_batches is covered by the GRANT ON ALL TABLES for vault_app.
BEGIN;

CREATE TABLE IF NOT EXISTS anchor_batches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Merkle root (hex) this batch anchors.
  root_hex char(64) NOT NULL,
  leaf_count int NOT NULL,
  -- PENDING | TIMESTAMPED | SIMULATED | FAILED
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  -- RFC 3161 timestamp token (base64 DER); NULL until timestamped / when simulated.
  timestamp_token_b64 text NULL,
  tsa_url varchar(255) NULL,
  tsa_serial varchar(120) NULL,
  timestamped_at timestamptz NULL,
  retries int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anchor_batches_status_created_at
  ON anchor_batches (status, created_at);

-- Per-document inclusion proof: which batch, the leaf position, and the sibling
-- path (jsonb array of { hash, position }) from the leaf up to the batch root.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS anchor_batch_id uuid NULL REFERENCES anchor_batches(id),
  ADD COLUMN IF NOT EXISTS anchor_leaf_index int NULL,
  ADD COLUMN IF NOT EXISTS anchor_proof jsonb NULL;

COMMIT;
