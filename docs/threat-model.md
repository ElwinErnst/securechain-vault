# SecureChain Vault Threat Model

## Assets

- confidencialidad de documentos
- integridad de documentos
- integridad del audit trail
- secretos de firma y cifrado
- exactitud de autorización por tenant

## Actores

- usuario legítimo
- usuario autenticado malicioso
- atacante externo
- cliente comprometido
- atacante de red
- storage comprometido
- servicio interno mal configurado o bypassing del gateway

## Entry points

- login en `auth-api`
- requests a `zerotrust-api`
- endpoints de vaults y documentos
- endpoints de auditoría
- comunicación interna `vault-api -> auth-api`

## Principales amenazas y mitigaciones

### 1. Bypass del gateway

Mitigaciones:

- `vault-api` verifica firma Zero Trust
- headers autenticados via HMAC
- timestamp y nonce para frenar replay

### 2. Broken access control entre tenants

Mitigaciones:

- tenant context firmado por `zerotrust-api`
- guards en `vault-api`
- revalidación de membership contra `auth-api`

### 3. Doble autoridad sobre tenants

Mitigaciones:

- `auth-api` como fuente de verdad única
- `vault-api` ya no crea tenants
- eliminación de dependencias estructurales locales a `tenants`

### 4. Exposición de blobs por fuga de storage

Mitigaciones:

- cifrado antes de persistir en MinIO
- bucket privado
- storage keys con contexto de tenant y vault

### 5. Tampering de documentos

Mitigaciones:

- hash del archivo
- auditoría
- posibilidad de anclaje externo más adelante

### 6. Manipulación de auditoría

Mitigaciones:

- tabla append-only
- hash chaining por scope
- separación clara entre dominio operativo y trazabilidad

### 7. Tokens stale o memberships desactualizadas

Mitigaciones:

- access tokens cortos
- posibilidad de revalidación remota en operaciones sensibles
- cache futuro sólo como optimización, no como fuente de verdad

## Assumptions

- TLS en producción
- secretos fuera del repo
- DB y MinIO no expuestos públicamente
- los servicios internos comparten secretos por canal seguro
