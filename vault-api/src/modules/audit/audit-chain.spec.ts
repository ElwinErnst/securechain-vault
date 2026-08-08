import {
  AuditEventFields,
  AuditSerializer,
  computeChainHash,
  computeEventHash,
  currentSerializer,
  getAuditSerializer,
} from '../../common/utils/audit-canonical.util';
import { ChainRow, SerializerResolver, verifyChainRows } from './audit-chain';

const SCOPE = 'tenant-A';

/** Build a well-formed v1 row: hashes are computed exactly like the writer does. */
function makeRow(
  seq: string,
  prevHash: string | null,
  overrides: Partial<AuditEventFields> = {},
  meta: { schemaVersion?: number; hashAlg?: string } = {},
): ChainRow {
  const fields: AuditEventFields = {
    id: '00000000-0000-4000-8000-000000000001',
    createdAt: '2026-07-01T12:03:00.000Z',
    scope: SCOPE,
    seq,
    tenantId: SCOPE,
    userId: 'user-1',
    action: 'DOCUMENT_READ',
    resourceType: 'document',
    resourceId: 'doc-1',
    outcome: 'SUCCESS',
    httpStatus: 200,
    httpMethod: 'GET',
    httpPath: '/documents/doc-1',
    ip: null,
    userAgent: null,
    metadata: null,
    ...overrides,
  };
  const serializer = currentSerializer();
  const eventHash = serializer.computeEventHash(fields);
  const chainHash = serializer.computeChainHash(prevHash, eventHash);
  return {
    ...fields,
    prevHash,
    eventHash,
    chainHash,
    schemaVersion: meta.schemaVersion ?? serializer.version,
    hashAlg: meta.hashAlg ?? 'sha256',
  };
}

/** A valid 3-row chain. */
function validChain(): ChainRow[] {
  const r1 = makeRow('1', null);
  const r2 = makeRow('2', r1.chainHash);
  const r3 = makeRow('3', r2.chainHash);
  return [r1, r2, r3];
}

describe('verifyChainRows', () => {
  it('accepts a well-formed chain and exposes the head', () => {
    const res = verifyChainRows(SCOPE, validChain());
    expect(res.status).toBe('VALID');
    expect(res.checked).toBe(3);
    expect(res.headSeq).toBe('3');
    expect(res.headHash).not.toBeNull();
    expect(res.firstBreak).toBeNull();
  });

  it('reports EMPTY for a scope with no rows', () => {
    const res = verifyChainRows(SCOPE, []);
    expect(res.status).toBe('EMPTY');
    expect(res.checked).toBe(0);
    expect(res.headHash).toBeNull();
  });

  it('detects a middle-row content edit (eventHash mismatch)', () => {
    const [r1, r2, r3] = validChain();
    // Attacker changes the action but cannot recompute the stored hashes.
    const tampered: ChainRow = { ...r2, action: 'DOCUMENT_DELETE' };
    const res = verifyChainRows(SCOPE, [r1, tampered, r3]);
    expect(res.status).toBe('BROKEN');
    expect(res.firstBreak?.reason).toBe('EVENT_HASH_MISMATCH');
    expect(res.firstBreak?.seq).toBe('2');
    expect(res.checked).toBe(1); // r1 verified before the break
  });

  it('detects timestamp tampering for current-version rows', () => {
    const [row] = validChain();
    const res = verifyChainRows(SCOPE, [
      { ...row, createdAt: '2026-07-01T12:04:00.000Z' },
    ]);
    expect(res.firstBreak?.reason).toBe('EVENT_HASH_MISMATCH');
  });

  it('detects id tampering for current-version rows', () => {
    const [row] = validChain();
    const res = verifyChainRows(SCOPE, [
      { ...row, id: '00000000-0000-4000-8000-000000000099' },
    ]);
    expect(res.firstBreak?.reason).toBe('EVENT_HASH_MISMATCH');
  });

  it('detects interior deletion as a seq gap', () => {
    const [r1, , r3] = validChain();
    const res = verifyChainRows(SCOPE, [r1, r3]);
    expect(res.status).toBe('BROKEN');
    expect(res.firstBreak?.reason).toBe('SEQ_GAP');
    expect(res.firstBreak?.seq).toBe('3');
  });

  it('detects front truncation as a bad genesis', () => {
    const [, r2, r3] = validChain();
    const res = verifyChainRows(SCOPE, [r2, r3]);
    expect(res.status).toBe('BROKEN');
    expect(res.firstBreak?.reason).toBe('BAD_GENESIS');
    expect(res.firstBreak?.seq).toBe('2');
  });

  it('detects a broken link (prevHash mismatch)', () => {
    const r1 = makeRow('1', null);
    const forged = makeRow('2', 'f'.repeat(64)); // points at a hash that is not r1
    const res = verifyChainRows(SCOPE, [r1, forged]);
    expect(res.status).toBe('BROKEN');
    expect(res.firstBreak?.reason).toBe('PREV_HASH_MISMATCH');
    expect(res.firstBreak?.seq).toBe('2');
  });

  it('detects an inconsistent stored chainHash', () => {
    const [r1, r2] = validChain();
    const corrupted: ChainRow = { ...r2, chainHash: '0'.repeat(64) };
    const res = verifyChainRows(SCOPE, [r1, corrupted]);
    expect(res.status).toBe('BROKEN');
    expect(res.firstBreak?.reason).toBe('CHAIN_HASH_MISMATCH');
    expect(res.firstBreak?.seq).toBe('2');
  });

  // The honest boundary: the internal chain CANNOT catch suffix truncation.
  // Deleting the newest rows leaves a shorter but perfectly consistent chain.
  // This is exactly the gap an anchored checkpoint is meant to close.
  it('does NOT detect newest-suffix deletion (documents the limitation)', () => {
    const [r1, r2] = validChain(); // r3 dropped
    const res = verifyChainRows(SCOPE, [r1, r2]);
    expect(res.status).toBe('VALID');
    expect(res.headSeq).toBe('2');
  });
});

describe('verifyChainRows — schema/algorithm versioning', () => {
  it.each([1, 2, 3])(
    'keeps historical schema v%i rows verifiable after the v4 serializer change',
    (version) => {
      const serializer = getAuditSerializer(version)!;
      const fields: AuditEventFields = {
        id: '00000000-0000-4000-8000-000000000001',
        createdAt: '2026-07-01T12:03:00.000Z',
        scope: SCOPE,
        seq: '1',
        tenantId: SCOPE,
        userId: 'user-1',
        action: 'DOCUMENT_READ',
        resourceType: 'document',
        resourceId: 'doc-1',
        outcome: 'SUCCESS',
        httpStatus: 200,
        httpMethod: 'GET',
        httpPath: '/documents/doc-1',
        ip: null,
        userAgent: null,
        metadata: { 'quoted\"key': 'historical' },
      };
      const eventHash = serializer.computeEventHash(fields);
      const row: ChainRow = {
        ...fields,
        prevHash: null,
        eventHash,
        chainHash: serializer.computeChainHash(null, eventHash),
        schemaVersion: version,
        hashAlg: serializer.hashAlg,
      };

      expect(verifyChainRows(SCOPE, [row]).status).toBe('VALID');
    },
  );

  it('uses normalized, collision-safe JSON for newly written v4 rows', () => {
    const serializer = currentSerializer();
    const base: AuditEventFields = {
      id: '00000000-0000-4000-8000-000000000001',
      createdAt: '2026-07-01T12:03:00.000Z',
      scope: SCOPE,
      seq: '1',
      tenantId: SCOPE,
      userId: 'user-1',
      action: 'DOCUMENT_READ',
      resourceType: 'document',
      resourceId: 'doc-1',
      outcome: 'SUCCESS',
      httpStatus: 200,
      httpMethod: 'GET',
      httpPath: '/documents/doc-1',
      ip: null,
      userAgent: null,
      metadata: null,
    };

    expect(serializer.version).toBe(4);
    expect(
      serializer.computeEventHash({ ...base, metadata: { 'a\":1,\"b': 2 } }),
    ).not.toBe(
      serializer.computeEventHash({ ...base, metadata: { a: 1, b: 2 } }),
    );
    expect(
      serializer.computeEventHash({
        ...base,
        metadata: { value: -0, omitted: undefined },
      }),
    ).toBe(serializer.computeEventHash({ ...base, metadata: { value: 0 } }));
  });

  it('rejects a row whose schema version has no registered serializer', () => {
    const row = makeRow('1', null, {}, { schemaVersion: 999 });
    const res = verifyChainRows(SCOPE, [row]);
    expect(res.status).toBe('BROKEN');
    expect(res.firstBreak?.reason).toBe('UNKNOWN_SCHEMA_VERSION');
    expect(res.firstBreak?.seq).toBe('1');
  });

  it('rejects a row whose stored hashAlg disagrees with its version serializer', () => {
    const row = makeRow('1', null, {}, { hashAlg: 'sha512' }); // v1 serializer is sha256
    const res = verifyChainRows(SCOPE, [row]);
    expect(res.status).toBe('BROKEN');
    expect(res.firstBreak?.reason).toBe('HASH_ALG_MISMATCH');
    expect(res.firstBreak?.seq).toBe('1');
  });

  // Crypto-agility: a row written under a different serializer verifies with
  // THAT serializer, not today's. Proves the verifier dispatches by version.
  it('verifies a row against its own version serializer via the resolver', () => {
    const fakeV2: AuditSerializer = {
      version: 99,
      hashAlg: 'sha256-test',
      computeEventHash: (f) => `v2:${computeEventHash(f)}`,
      computeChainHash: (prev, ev) => `v2:${computeChainHash(prev, ev)}`,
    };
    const resolve: SerializerResolver = (v) =>
      v === 99 ? fakeV2 : getAuditSerializer(v);

    const fields: AuditEventFields = {
      id: '00000000-0000-4000-8000-000000000001',
      createdAt: '2026-07-01T12:03:00.000Z',
      scope: SCOPE,
      seq: '1',
      tenantId: SCOPE,
      userId: 'user-1',
      action: 'DOCUMENT_READ',
      resourceType: 'document',
      resourceId: 'doc-1',
      outcome: 'SUCCESS',
      httpStatus: 200,
      httpMethod: 'GET',
      httpPath: '/documents/doc-1',
      ip: null,
      userAgent: null,
      metadata: null,
    };
    const eventHash = fakeV2.computeEventHash(fields);
    const v2Row: ChainRow = {
      ...fields,
      prevHash: null,
      eventHash,
      chainHash: fakeV2.computeChainHash(null, eventHash),
      schemaVersion: 99,
      hashAlg: fakeV2.hashAlg,
    };

    // With the v2-aware resolver it verifies…
    expect(verifyChainRows(SCOPE, [v2Row], resolve).status).toBe('VALID');
    // …but the default resolver only knows v1, so the same row is rejected.
    expect(verifyChainRows(SCOPE, [v2Row]).firstBreak?.reason).toBe(
      'UNKNOWN_SCHEMA_VERSION',
    );
  });
});
