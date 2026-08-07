-- Crypto-agility for the audit chain: record the serialization/algorithm each
-- row was written under, so the verifier can recompute hashes with the
-- contemporaneous rule instead of assuming today's. Existing rows are v1/sha256.
BEGIN;

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS schema_version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS hash_alg varchar(20) NOT NULL DEFAULT 'sha256';

COMMIT;
