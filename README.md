# SecureChain Vault

Custodia segura de documentos multi-tenant: cifrado en reposo, auditoría a prueba de manipulación y notarización.

## Qué es (individual)

`vault-api` es un **servicio de custodia de documentos** con garantías criptográficas fuertes:

- vaults y documentos por tenant
- cifrado envelope (AES-256-GCM, DEK por tenant, IV aleatorio por operación) antes de tocar el storage
- auditoría append-only con hash chaining, forzada en la DB
- notarización con árbol de Merkle (RFC 6962) + timestamps RFC 3161
- checkpoints anti-truncamiento anclados

Sirve como servicio de document custody / notarización aunque no uses el resto de Sytadel. No es un IdP: no crea usuarios ni tenants — espera que la identidad llegue de un directorio externo y que las requests vengan firmadas por un gateway de confianza.

## Rol en Sytadel

Es el **almacén de datos sensibles** de la suite y el eslabón final del flujo. Solo acepta requests **firmadas por `zerotrust-api`**, y resuelve tenants/memberships remotamente contra `auth-api` (sin foreign keys locales a identidad). Los clientes nunca lo tocan directo: entran por `http://localhost:3010/vault` a través del gateway.

Ver la [arquitectura de la suite](../README.md).

## Dirección arquitectónica

- `auth-api` es la autoridad de `tenants` y `memberships`; `vault-api` los consume de forma remota
- `vault-api` mantiene `tenant_id` como dato de dominio para vaults, documentos y auditoría
- `vault-api` no crea tenants ni depende de foreign keys locales hacia `tenants`

## Capacidades implementadas

- vaults y documentos multi-tenant
- cifrado envelope antes del storage
- auditoría append-only con hash chaining local + checkpoints anclados
- validación de requests firmadas por Zero Trust
- integración remota con el directorio de `auth-api`

## Uso standalone

```bash
docker compose up --build   # desde este repo
```

- `vault-api`: [http://localhost:3000](http://localhost:3000)

Requisitos mínimos: PostgreSQL (metadatos, auditoría, claves de tenant), MinIO (blobs cifrados), un directorio de identidad (`AUTH_DIRECTORY_BASE_URL`) y un emisor de firmas Zero Trust en el que confiar (`ZT_HMAC_SECRET` o claves públicas en `ZT_VERIFY_PUBLIC_KEYS`). El entorno reproducible incluye SQL de init en `infra/postgres/init` y crea el bucket de MinIO automáticamente.

## Uso en la suite

Desde la raíz del meta-repo, `docker compose up --build`. Acceso recomendado desde cliente: [http://localhost:3010/vault](http://localhost:3010/vault) a través de `zerotrust-api`. En la red interna responde en `http://vault-api:3000` y resuelve identidad en `http://auth-api:3001/api`.

## Componentes

- `vault-api` (NestJS)
- PostgreSQL + MinIO
- documentación de arquitectura y threat model

## Documentación

- [docs/architecture.md](./docs/architecture.md)
- [docs/decisions.md](./docs/decisions.md)
- [docs/threat-model.md](./docs/threat-model.md)
- [vault-api/README.md](./vault-api/README.md)

## Licencia

Apache-2.0. Ver [LICENSE](./LICENSE).
