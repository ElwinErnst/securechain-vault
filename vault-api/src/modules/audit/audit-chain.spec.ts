import {
  AuditEventFields,
  computeChainHash,
  computeEventHash,
} from '../../common/utils/audit-canonical.util';
import { ChainRow, verifyChainRows } from './audit-chain';

const SCOPE = 'tenant-A';

/** Build a well-formed row: hashes are computed exactly like the writer does. */
function makeRow(
  seq: string,
  prevHash: string | null,
  overrides: Partial<AuditEventFields> = {},
): ChainRow {
  const fields: AuditEventFields = {
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
  const eventHash = computeEventHash(fields);
  const chainHash = computeChainHash(prevHash, eventHash);
  return { ...fields, prevHash, eventHash, chainHash };
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
