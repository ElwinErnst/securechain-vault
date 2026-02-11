# SecureChain Vault

Secure document storage platform focused on security-first architecture.

## Features

-   Strong authentication (JWT + refresh rotation)
-   RBAC + per-document ACL
-   Encryption before object storage
-   Append-only audit trail
-   Blockchain-based integrity anchoring (EVM testnet -- planned)

## Stack

### Backend

-   NestJS
-   TypeORM
-   PostgreSQL
-   Argon2
-   JWT (short-lived access + rotating refresh tokens)

### Storage

-   MinIO (S3-compatible object storage)

### Infrastructure

-   Docker Compose
-   Isolated service containers
-   Volume-based persistence
-   Init SQL for deterministic schema creation
-   No `synchronize: true` in production

### Frontend (planned)

-   Next.js

### Blockchain (Sprint 3)

-   Ethereum (EVM-compatible testnet)
-   Solidity smart contract (hash anchoring only)

## Architecture Overview

Client\
↓\
NestJS API\
↓\
PostgreSQL (metadata, ACL, audit)\
MinIO (encrypted blobs)\
↓\
(EVM chain -- integrity anchoring)

### Trust Boundaries

-   Client: untrusted
-   API: trusted compute boundary
-   Database: trusted metadata store
-   Object storage: treated as observable
-   Blockchain: public, immutable, stores only hashes

## Infrastructure

The project uses Docker Compose to provide a fully reproducible
development environment.

### Services

-   PostgreSQL 16
-   MinIO (S3-compatible storage)

### Principles

-   Database schema initialized via SQL scripts
-   Volume-backed persistence
-   Deterministic reset workflow
-   Clear separation of application and infrastructure layers

## Local Setup

Start infrastructure:

yarn db:up

Start API:

yarn start:dev

Reset database:

yarn db:reset

## Security Features Implemented

-   Password hashing with Argon2
-   Short-lived access tokens
-   Refresh token rotation
-   Refresh token reuse detection
-   Family-based session revocation
-   Logout (single-session + global)
-   Hashed refresh tokens in DB
-   Strict TypeScript typing
-   Dockerized reproducible infra

## Documentation

-   /docs/architecture.md
-   /docs/adrs.md
-   /docs/threat-model.md

## Current Status

-   Sprint 1 Complete --- Authentication & Security Foundation
-   Sprint 2 --- Multi-tenant Vault + Document ACL (in progress)
-   Sprint 3 --- On-chain hash anchoring (planned)

## Roadmap

-   [ ] Multi-tenant organizations
-   [ ] Vault creation
-   [ ] Document upload (SHA-256 hashing)
-   [ ] AES-256-GCM encryption before storage
-   [ ] Append-only audit log
-   [ ] EVM smart contract for integrity proof