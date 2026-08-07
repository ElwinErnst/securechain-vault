import { sha256Hex, stableStringify } from './audit-hash.util';

export type AuditOutcome = 'SUCCESS' | 'FAILURE';

/**
 * Canonical, hashable fields of an audit event.
 *
 * This is the single source of truth shared by the writer (AuditService) and
 * the verifier (AuditVerifierService). If these two ever build the payload
 * differently — even by one field — the verifier reports false tamper positives
 * on untouched rows. Keep the payload shape in exactly one place: here.
 *
 * NOTE: `schemaVersion` and `hashAlg` are NOT in this type on purpose. They are
 * row metadata that select which serializer verifies a row; folding them into
 * the v1 payload would change every existing hash and break historical
 * verification. See the serializer registry below.
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
 * A versioned way to hash an audit event. The writer stamps each row with the
 * serializer's `version` and `hashAlg`; the verifier reads those columns and
 * applies the SAME serializer, so a serialization change (new field, different
 * null handling, different algorithm) only affects rows written under the new
 * version and never retroactively invalidates older rows.
 */
export type AuditSerializer = {
  version: number;
  hashAlg: string;
  computeEventHash(f: AuditEventFields): string;
  computeChainHash(prevHash: string | null, eventHash: string): string;
};

/**
 * v1 payload builder — FROZEN. Do not add, remove or reorder fields: every
 * audit row ever written under version 1 hashes exactly this shape. A change
 * here is a new version, not an edit to this one.
 *
 * Field order is irrelevant (`stableStringify` sorts keys); the field SET and
 * values are what the hash commits to.
 */
function buildAuditEventPayloadV1(f: AuditEventFields): Record<string, unknown> {
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

const V1: AuditSerializer = {
  version: 1,
  hashAlg: 'sha256',
  computeEventHash(f) {
    return sha256Hex(stableStringify(buildAuditEventPayloadV1(f)));
  },
  computeChainHash(prevHash, eventHash) {
    return sha256Hex(`${prevHash ?? ''}|${eventHash}`);
  },
};

/**
 * All known serializers, keyed by schema version. Add a new entry (never mutate
 * an existing one) when the canonical serialization or hash algorithm changes,
 * and bump CURRENT_SCHEMA_VERSION so new rows adopt it.
 */
const SERIALIZERS: Record<number, AuditSerializer> = {
  1: V1,
};

/** The version new rows are written under. */
export const CURRENT_SCHEMA_VERSION = 1;

/** The serializer new rows are written with. */
export function currentSerializer(): AuditSerializer {
  return SERIALIZERS[CURRENT_SCHEMA_VERSION];
}

/** Resolve the serializer that wrote a given row, or null if the version is unknown. */
export function getAuditSerializer(version: number): AuditSerializer | null {
  return SERIALIZERS[version] ?? null;
}

// --- v1 convenience exports (kept for the writer, tests and callers that build
// v1 rows directly). These are exactly the current serializer's functions. ---

export function buildAuditEventPayload(f: AuditEventFields): Record<string, unknown> {
  return buildAuditEventPayloadV1(f);
}

export function computeEventHash(f: AuditEventFields): string {
  return V1.computeEventHash(f);
}

export function computeChainHash(prevHash: string | null, eventHash: string): string {
  return V1.computeChainHash(prevHash, eventHash);
}
