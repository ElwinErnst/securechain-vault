# SecureChain Vault — Architecture

## Goal
SecureChain Vault is a secure document storage platform that provides:
- strong authentication and access control (RBAC + per-document ACL)
- encryption at rest (server-side before storage)
- immutable audit trail (append-only)
- integrity verification anchored on a public blockchain (hash + timestamp)

## High-level components
- vault-web (Next.js): UI for users, sharing, and verification
- vault-api (NestJS): authentication, authorization, audit, storage orchestration
- PostgreSQL: metadata, access control lists, audit logs
- MinIO (S3-compatible): encrypted file blobs
- (Sprint 3) EVM chain: stores document hashes (bytes32) for public integrity proof

## Data flow (upload)
1. User authenticates (JWT).
2. User uploads a file to vault-api.
3. vault-api:
   - computes SHA-256 hash of raw content
   - (Sprint 2) encrypts content using AES-256-GCM and uploads to MinIO
   - stores metadata in Postgres (owner, size, mimeType, content hash, storage key)
   - grants owner ACL = ADMIN
   - writes audit event DOC_UPLOAD
4. (Sprint 3) vault-api registers (docId, hash) on-chain and stores tx metadata.

## Data flow (download)
1. User requests download.
2. vault-api checks effective permission:
   - owner => ADMIN
   - else ACL entry => READ/WRITE/ADMIN
3. If allowed, vault-api fetches blob from MinIO
   - (Sprint 2) decrypts and streams it back
4. Writes audit event DOC_DOWNLOAD.

## Data flow (verify integrity)
1. Client or API recomputes SHA-256 on the downloaded clear file.
2. Compare:
   - DB stored hash (expected)
   - on-chain hash (public proof)
3. Result:
   - match => integrity OK
   - mismatch => tampering/corruption suspected

## Trust boundaries
- Client: untrusted (may be compromised)
- API: trusted compute boundary
- DB: trusted persistence for metadata and ACL
- Object storage: treated as potentially observable; confidentiality relies on encryption
- Blockchain: public, immutable, used only for hashes (no sensitive data)

## Non-goals
- Storing documents on-chain (costly, public, not required)
- Acting as a custodial wallet or key custodian for users
