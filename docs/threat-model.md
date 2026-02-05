# SecureChain Vault — Threat Model (MVP)

## Assets to protect
- Document confidentiality (file contents)
- Document integrity (file must not be altered without detection)
- Access control (only authorized users can read/share/delete)
- Audit trail integrity (logs must be append-only and reliable)
- Secrets (JWT signing keys, encryption keys, DB creds)

## Actors
- Legitimate user
- Malicious authenticated user (insider threat)
- External attacker (unauthenticated)
- Compromised client device
- Compromised storage (MinIO/S3) or DB leak
- Network attacker (MITM)

## Entry points
- Auth endpoints (register/login/refresh)
- File upload/download
- Share/revoke access
- Admin/auditor endpoints

## Top threats and mitigations

### 1) Credential stuffing / brute force on login
Mitigations:
- rate limiting on /auth/login (Sprint 2)
- strong password policy (min length, common passwords block)
- optional MFA (future)

### 2) Broken access control (IDOR)
Mitigations:
- server-side authorization on every document operation
- effective permission check: owner => ADMIN, else ACL lookup
- never trust client-provided ownerId/documentId relationship

### 3) Data exposure from object storage leak
Mitigations:
- encrypt files BEFORE upload (AES-256-GCM) (Sprint 2)
- do not store plaintext files in storage
- least-privilege credentials and private bucket policy

### 4) Tampering with stored documents
Mitigations:
- store SHA-256 of plaintext content in DB
- anchor hash on-chain for public verification (Sprint 3)
- verify on download or via explicit verify flow

### 5) Token theft / session abuse
Mitigations:
- short-lived access tokens (e.g., 15m)
- refresh token rotation (Sprint 2)
- store refresh token hash (DB/Redis) (Sprint 2)
- secure cookie option for web (future)

### 6) Audit log manipulation
Mitigations:
- append-only table (no updates/deletes)
- DB role permissions (API role cannot UPDATE/DELETE audit_log)
- optional hash chaining of logs (future)
- optional on-chain anchoring of log batches (future)

### 7) Upload of malicious files
Mitigations:
- allowlist mime types (MVP)
- max file size limits (MVP)
- optional antivirus scanning (future)

## Assumptions
- Production uses TLS everywhere
- Secrets are stored in env/secret manager (never committed)
- Database is not publicly accessible
