import { sha256Hex, stableStringify } from './audit-hash.util';

export type AuditOutcome = 'SUCCESS' | 'FAILURE';

/**
 * Canonical, hashable fields of an audit event.
 *
 * This is the single source of truth shared by the writer (AuditService) and
 * the verifier (AuditVerifierService). If these two ever build the payload
 * differently — even by one field — the verifier reports false tamper positives
 * on untouched rows. Keep the payload shape in exactly one place: here.
 */
export type AuditEventFields = {
  scope: string;
  seq: string; // bigint as string
  tenantId: string | null;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: AuditOutcome;
  httpStatus: number;
  httpMethod: string;
  httpPath: string;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
};

/**
 * Build the canonical payload hashed into `eventHash`.
 *
 * Field order here is irrelevant: `stableStringify` sorts keys before hashing.
 * What matters is the exact set of fields and their values.
 */
export function buildAuditEventPayload(f: AuditEventFields): Record<string, unknown> {
  return {
    scope: f.scope,
    seq: f.seq,
    tenantId: f.tenantId,
    userId: f.userId,
    action: f.action,
    resourceType: f.resourceType,
    resourceId: f.resourceId,
    outcome: f.outcome,
    httpStatus: f.httpStatus,
    httpMethod: f.httpMethod,
    httpPath: f.httpPath,
    ip: f.ip,
    userAgent: f.userAgent,
    metadata: f.metadata,
  };
}

/** sha256 over the canonical serialization of the event payload. */
export function computeEventHash(f: AuditEventFields): string {
  return sha256Hex(stableStringify(buildAuditEventPayload(f)));
}

/** Chain link: sha256 of `${prevHash}|${eventHash}` (empty string for genesis). */
export function computeChainHash(prevHash: string | null, eventHash: string): string {
  return sha256Hex(`${prevHash ?? ''}|${eventHash}`);
}
