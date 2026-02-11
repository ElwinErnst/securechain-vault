# SecureChain Vault

Secure document storage platform with:

- Strong authentication (JWT + refresh rotation)
- RBAC + per-document ACL
- Encryption before object storage
- Append-only audit trail
- Blockchain-based integrity anchoring (EVM testnet – planned)

---

## Stack

Backend:
- NestJS
- TypeORM
- PostgreSQL
- Argon2
- JWT (access + rotating refresh)

Storage:
- MinIO (S3-compatible)

Frontend (planned):
- Next.js

Blockchain (Sprint 3):
- Ethereum (EVM-compatible testnet)
- Solidity (hash anchoring only)

---

## Security Features Implemented

✔ Password hashing with Argon2  
✔ Short-lived access tokens  
✔ Refresh token rotation  
✔ Refresh token reuse detection  
✔ Family-based session revocation  
✔ Logout (single + global)  
✔ Hashed refresh tokens in DB  
✔ Dockerized reproducible infra  
✔ Strict TypeScript typing  

---

## Architecture Docs

- `/docs/architecture.md`
- `/docs/adrs.md`
- `/docs/threat-model.md`

---

## Current Status

✅ Sprint 1 Complete — Auth & Security Foundation  
🚧 Sprint 2 — Multi-tenant Vault + Document ACL  
🔜 Sprint 3 — On-chain hash anchoring  

---

## Roadmap

- [ ] Multi-tenant organizations
- [ ] Vault creation
- [ ] Document upload (SHA-256 hashing)
- [ ] AES-256-GCM encryption before storage
- [ ] Append-only audit log
- [ ] EVM smart contract for integrity proof
