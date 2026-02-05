# SecureChain Vault — Architecture Decisions (ADRs-lite)

## D1 — Use blockchain only for integrity proofs
Decision:
- Store only document hashes (bytes32) on-chain, not documents.

Rationale:
- Documents are sensitive and large.
- On-chain storage is public and expensive.
- Hash anchoring gives integrity + timestamp with minimal exposure.

## D2 — Encrypt before object storage
Decision:
- Encrypt document content at the API layer prior to MinIO/S3 upload (AES-256-GCM).

Rationale:
- Object storage should be treated as potentially observable.
- Encryption makes a storage leak less catastrophic.

## D3 — RBAC + per-document ACL
Decision:
- RBAC for global capabilities (admin/auditor), ACL for document-specific sharing.

Rationale:
- Realistic enterprise pattern.
- Enables secure sharing between users without over-permissioning.

## D4 — Append-only audit log
Decision:
- Audit events are write-only, never updated or deleted.

Rationale:
- Audit logs are a security control and must be trustworthy.
- Supports forensics and compliance.

## D5 — TypeORM + PostgreSQL
Decision:
- Use TypeORM with Postgres for metadata and access control.

Rationale:
- Mature relational model for ACL and audit queries.
- Strong consistency for authorization decisions.
