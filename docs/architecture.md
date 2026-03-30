# SecureChain Vault Architecture

## Objetivo

`vault-api` es el servicio de dominio para almacenamiento seguro de documentos dentro de Sentinel Suite.

Provee:

- vaults multi-tenant
- manejo de documentos
- cifrado antes de object storage
- auditoría append-only
- integración con Zero Trust

## Boundaries

- `auth-api`: autoridad de usuarios, tenants y memberships
- `zerotrust-api`: punto de entrada confiable y firmante de requests
- `vault-api`: dominio de vaults, documentos, claves y auditoría
- PostgreSQL: metadatos y eventos
- MinIO: blobs cifrados

## High-level flow

```text
Client
  -> auth-api (login)
  -> zerotrust-api
  -> vault-api
  -> Postgres / MinIO
```

## Flujo de autenticación y autorización

1. el usuario hace login en `auth-api`
2. `auth-api` emite un JWT para `zerotrust-api`
3. el cliente llama a `zerotrust-api`
4. `zerotrust-api` valida JWT y policy
5. `zerotrust-api` firma la request
6. `vault-api` verifica la firma y obtiene `userId`, `tenantId` y `roles`
7. cuando necesita validar membership o listar tenants, `vault-api` consulta a `auth-api`

## Flujo de upload

1. request autenticada entra por `zerotrust-api`
2. `vault-api` valida acceso al tenant y al vault
3. calcula hash del archivo
4. cifra el contenido
5. sube el blob cifrado a MinIO
6. guarda metadatos en PostgreSQL
7. escribe evento de auditoría

## Flujo de download

1. request autenticada entra por `zerotrust-api`
2. `vault-api` valida acceso
3. busca metadatos y blob
4. descifra el contenido
5. devuelve el archivo
6. escribe evento de auditoría

## Modelo de tenants actual

Decisión vigente:

- `auth-api` es la fuente de verdad de tenants y memberships
- `vault-api` conserva `tenant_id` como identificador de contexto
- `vault-api` ya no crea tenants
- `vault-api` ya no depende de foreign keys a `tenants` para operar su dominio

Eso permite:

- menos duplicación de ownership
- menos riesgo de desalineación de IDs o roles
- posibilidad de agregar cache más adelante sin cambiar el modelo mental

## Trust boundaries

- cliente: no confiable
- gateway Zero Trust: boundary de entrada confiable
- `vault-api`: boundary de cómputo confiable
- object storage: observable, no confiable para confidencialidad
- PostgreSQL: persistencia confiable de metadatos

## Non-goals

- crear tenants localmente en `vault-api`
- confiar en headers no firmados
- usar object storage como fuente de verdad de permisos
