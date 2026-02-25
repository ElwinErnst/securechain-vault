import { SetMetadata } from '@nestjs/common';

export const AUDIT_META_KEY = 'audit:meta';

export type AuditMeta = {
  action: string;
  resourceType: string;
  // Permite resolver resourceId desde params/body (sin acoplarte)
  resourceIdParam?: string; // ej: "id" para /vaults/:id
  resourceIdBodyPath?: string; // ej: "vaultId" o "document.id"
  // metadata extra (se mezcla con lo que agrega el interceptor)
  metadata?: Record<string, unknown>;
  // si querés auditar también errores (por defecto sí)
  auditOnError?: boolean; // default true
};

export const Audit = (meta: AuditMeta) => SetMetadata(AUDIT_META_KEY, meta);
