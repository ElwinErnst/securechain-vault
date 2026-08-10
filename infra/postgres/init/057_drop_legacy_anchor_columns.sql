-- Drop the vestigial blockchain-era anchor columns from documents. Anchoring
-- moved to Merkle batching + RFC 3161 timestamps (see 055_anchor_merkle.sql);
-- anchor_tx_hash and anchor_chain_id have been unused since and carry no data
-- worth keeping. anchor_status / anchored_at / anchor_retries stay in use.
BEGIN;

ALTER TABLE documents
  DROP COLUMN IF EXISTS anchor_tx_hash,
  DROP COLUMN IF EXISTS anchor_chain_id;

COMMIT;
