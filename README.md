# SecureChain Vault

Subproyecto de almacenamiento seguro de documentos dentro de Sentinel Suite.

## Estado actual

`vault-api` ya está integrado con:

- `auth-api` para identidad, tenants y memberships
- `zerotrust-api` como perímetro obligatorio de entrada
- PostgreSQL para metadatos, auditoría y claves de tenant
- MinIO para blobs cifrados

## Dirección arquitectónica vigente

- `auth-api` es la autoridad de `tenants` y `memberships`
- `vault-api` consume esa información de forma remota
- `vault-api` ya no crea tenants
- `vault-api` mantiene `tenant_id` como dato de dominio para vaults, documentos y auditoría
- `vault-api` ya no depende de foreign keys locales hacia `tenants`

## Componentes

- `vault-api` (NestJS)
- PostgreSQL
- MinIO
- documentación de arquitectura y threat model

## Capacidades implementadas

- vaults multi-tenant
- documentos por tenant y vault
- cifrado de documentos antes de storage
- auditoría append-only con hash chaining local
- validación de requests firmadas por Zero Trust
- integración remota con el directorio de `auth-api`

## Infraestructura

El entorno de desarrollo reproducible usa Docker Compose y SQL de inicialización:

- schema base en `infra/postgres/init`
- bucket de MinIO creado automáticamente
- persistencia por volúmenes

## Arranque

Desde la raíz del repo:

```bash
docker compose up --build
```

Servicio expuesto:

- `vault-api`: [http://localhost:3000](http://localhost:3000)

Acceso recomendado desde cliente:

- [http://localhost:3010/vault](http://localhost:3010/vault) a través de `zerotrust-api`

## Documentación

- [docs/architecture.md](/Users/sasha/Proyects/sentinel-suite/securechain-vault/docs/architecture.md)
- [docs/decisions.md](/Users/sasha/Proyects/sentinel-suite/securechain-vault/docs/decisions.md)
- [docs/threat-model.md](/Users/sasha/Proyects/sentinel-suite/securechain-vault/docs/threat-model.md)
- [vault-api/README.md](/Users/sasha/Proyects/sentinel-suite/securechain-vault/vault-api/README.md)
