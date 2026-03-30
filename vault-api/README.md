# SecureChain Vault API

API de dominio para vaults, documentos, cifrado y auditoría.

## Responsabilidades

- creación y listado de vaults
- upload, download y borrado de documentos
- cifrado antes de guardar en MinIO
- manejo de claves por tenant
- auditoría append-only
- verificación de requests firmadas por `zerotrust-api`

## Qué no hace más

`vault-api` ya no es dueño de:

- creación de tenants
- memberships por tenant
- resolución autoritativa de roles

Eso ahora se resuelve desde `auth-api`.

## Integración con auth-api

`vault-api` tiene un cliente interno de directorio que usa:

- `GET /api/internal/tenants/:id`
- `GET /api/internal/memberships/resolve`
- `GET /api/internal/users/:userId/tenants`

Con eso:

- `GET /tenants` devuelve tenants desde `auth-api`
- el guard de RBAC de tenant valida memberships contra `auth-api`
- `POST /tenants` devuelve `409 Conflict`

## Integración con Zero Trust

`vault-api` espera requests firmadas con:

- `x-zt-*`
- HMAC compartido
- timestamp válido
- nonce no repetido

El acceso público recomendado es a través de `zerotrust-api`, no directo.

## Setup local

```bash
yarn install
yarn start:dev
```

Build:

```bash
yarn build
yarn start:prod
```

## Variables relevantes

- DB de PostgreSQL
- MinIO
- `ZT_HMAC_SECRET`
- `AUTH_DIRECTORY_BASE_URL`
- `AUTH_DIRECTORY_SERVICE_SECRET`
- `MASTER_KEY_B64`
- `MASTER_KEY_VERSION`

## Notas de modelo

- `tenant_id` sigue existiendo en vaults, documents, tenant_keys y audit_logs
- ya no hay dependencia estructural obligatoria a una tabla local `tenants`
- la relación fuerte que sí permanece es `documents -> vaults`
