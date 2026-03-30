# SecureChain Vault Architecture Decisions

## D1

Decisión:

- `auth-api` es la fuente de verdad de tenants y memberships

Rationale:

- evita doble autoridad
- reduce riesgo de desalineación entre servicios
- simplifica evolución futura con cache opcional

## D2

Decisión:

- `vault-api` consume directorio de tenants y memberships vía endpoints internos de `auth-api`

Rationale:

- mantiene a `vault-api` enfocado en su dominio
- desacopla autorización del almacenamiento local de membresías
- permite revalidar acceso en operaciones sensibles

## D3

Decisión:

- `vault-api` no crea tenants; `POST /tenants` debe fallar o delegar

Rationale:

- refuerza el ownership correcto del dato
- evita que aparezcan tenants huérfanos o inconsistentes

## D4

Decisión:

- mantener `tenant_id` como dato de dominio en `vaults`, `documents`, `tenant_keys` y `audit_logs`

Rationale:

- sigue siendo útil para scoping, índices, auditoría y storage keys
- no hace falta una entidad local autoritativa para conservar ese contexto

## D5

Decisión:

- remover foreign keys locales hacia `tenants` dentro de `vault-api`

Rationale:

- reduce acople estructural a un dato cuyo ownership ya está fuera del servicio
- evita que una tabla local heredada condicione el dominio real de `vault`

## D6

Decisión:

- mantener auditoría append-only con hash chaining local

Rationale:

- permite trazabilidad y verificación de integridad
- soporta forensics sin necesidad de blockchain en la etapa actual

## D7

Decisión:

- cifrar documentos antes de escribir a MinIO

Rationale:

- object storage se trata como observable
- el storage leak pasa a ser menos crítico para confidencialidad
