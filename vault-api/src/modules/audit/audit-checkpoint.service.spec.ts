import { createHash } from 'crypto';

import { Repository } from 'typeorm';

import { AuditCheckpointEntity } from '../../database/entities/audit-checkpoint.entity';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { AuditVerifierService } from './audit-verifier.service';
import {
  AuditCheckpointService,
  computeCheckpointHash,
} from './audit-checkpoint.service';
import type {
  TimestampClientPort,
  TimestampResult,
} from '../../common/modules/timestamp/timestamp-client.port';
import type { ChainVerifyResult } from './audit-chain';

const REAL: TimestampResult = {
  simulated: false,
  tokenB64: 'dG9rZW4=',
  tsaUrl: 'https://tsa.example/tsr',
  serial: '7',
  timestampedAt: new Date('2026-05-05T00:00:00Z'),
};
const SIMULATED: TimestampResult = {
  simulated: true,
  tokenB64: null,
  tsaUrl: null,
  serial: null,
  timestampedAt: new Date('2026-01-01T00:00:00Z'),
};

function verifyResult(over: Partial<ChainVerifyResult>): ChainVerifyResult {
  return {
    scope: 'GLOBAL',
    status: 'VALID',
    checked: 5,
    headSeq: '5',
    headHash: 'h'.repeat(64),
    firstBreak: null,
    ...over,
  };
}

function makeService(opts: {
  verify: ChainVerifyResult;
  latest?: AuditCheckpointEntity | null;
  ts?: TimestampResult;
  scopes?: string[];
  rowAtAnchor?: { chainHash: string } | null;
  tokenValid?: boolean;
}): {
  service: AuditCheckpointService;
  save: jest.Mock;
  timestampRoot: jest.Mock;
} {
  const save = jest.fn((c: AuditCheckpointEntity) => ({ ...c, id: 'cp-1' }));
  const repo = {
    findOne: jest.fn().mockResolvedValue(opts.latest ?? null),
    create: (c: Partial<AuditCheckpointEntity>) => c,
    save,
  } as unknown as Repository<AuditCheckpointEntity>;

  const auditRepo = {
    findOne: jest.fn().mockResolvedValue(opts.rowAtAnchor ?? null),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue((opts.scopes ?? []).map((scope) => ({ scope }))),
    }),
  } as unknown as Repository<AuditLogEntity>;

  const verifier = {
    verifyScope: jest.fn().mockResolvedValue(opts.verify),
  } as unknown as AuditVerifierService;

  const timestampRoot = jest.fn().mockResolvedValue(opts.ts ?? REAL);
  const timestampClient: TimestampClientPort = { timestampRoot };

  const tokenVerifier = {
    verifyToken: jest
      .fn()
      .mockResolvedValue(
        opts.tokenValid === false
          ? { valid: false, reason: 'token signature did not verify' }
          : { valid: true, reason: null },
      ),
  };

  return {
    service: new AuditCheckpointService(
      repo,
      auditRepo,
      verifier,
      timestampClient,
      tokenVerifier,
    ),
    save,
    timestampRoot,
  };
}

const HEAD = 'h'.repeat(64);

function validCheckpoint(
  over: Partial<AuditCheckpointEntity> = {},
): AuditCheckpointEntity {
  const headSeq = over.headSeq ?? '5';
  const headHash = over.headHash ?? HEAD;
  return {
    scope: 'GLOBAL',
    headSeq,
    headHash,
    checkpointHash: computeCheckpointHash('GLOBAL', headSeq, headHash),
    status: 'TIMESTAMPED',
    timestampTokenB64: 'dG9rZW4=',
    tsaUrl: 'https://tsa.example/tsr',
    tsaSerial: '7',
    timestampedAt: new Date('2026-05-05T00:00:00Z'),
    ...over,
  } as AuditCheckpointEntity;
}

describe('AuditCheckpointService', () => {
  it('computeCheckpointHash is deterministic and binds scope+seq+head', () => {
    const h = computeCheckpointHash('GLOBAL', '5', 'abc');
    expect(h).toBe(createHash('sha256').update('GLOBAL\n5\nabc').digest('hex'));
    expect(computeCheckpointHash('GLOBAL', '6', 'abc')).not.toBe(h);
  });

  it('skips an empty chain', async () => {
    const { service, timestampRoot } = makeService({
      verify: verifyResult({ status: 'EMPTY', headSeq: null, headHash: null }),
    });
    await expect(service.createCheckpoint('GLOBAL')).resolves.toEqual({
      status: 'SKIPPED_EMPTY',
    });
    expect(timestampRoot).not.toHaveBeenCalled();
  });

  it('refuses to checkpoint a broken chain', async () => {
    const { service, timestampRoot } = makeService({
      verify: verifyResult({
        status: 'BROKEN',
        firstBreak: { seq: '3', reason: 'PREV_HASH_MISMATCH', detail: 'x' },
      }),
    });
    await expect(service.createCheckpoint('GLOBAL')).resolves.toEqual({
      status: 'SKIPPED_BROKEN',
    });
    expect(timestampRoot).not.toHaveBeenCalled();
  });

  it('anchors a valid head, timestamping the checkpoint hash', async () => {
    const { service, timestampRoot } = makeService({
      verify: verifyResult({}),
    });

    const res = await service.createCheckpoint('GLOBAL');

    const expectedHash = computeCheckpointHash('GLOBAL', '5', 'h'.repeat(64));
    expect(timestampRoot).toHaveBeenCalledWith(expectedHash);
    expect(res.status).toBe('CREATED');
    if (res.status !== 'CREATED') return;
    expect(res.checkpoint.status).toBe('TIMESTAMPED');
    expect(res.checkpoint.headSeq).toBe('5');
    expect(res.checkpoint.checkpointHash).toBe(expectedHash);
    expect(res.checkpoint.timestampTokenB64).toBe(REAL.tokenB64);
    expect(res.checkpoint.timestampedAt).toEqual(REAL.timestampedAt);
  });

  it('records a simulated timestamp as SIMULATED with no token', async () => {
    const { service } = makeService({
      verify: verifyResult({}),
      ts: SIMULATED,
    });
    const res = await service.createCheckpoint('GLOBAL');

    expect(res.status).toBe('CREATED');
    if (res.status !== 'CREATED') return;
    expect(res.checkpoint.status).toBe('SIMULATED');
    expect(res.checkpoint.timestampTokenB64).toBeNull();
    expect(res.checkpoint.timestampedAt).toBeNull();
  });

  it('skips when the head has not advanced since the last checkpoint', async () => {
    const { service, timestampRoot } = makeService({
      verify: verifyResult({ headSeq: '5' }),
      latest: { headSeq: '5' } as AuditCheckpointEntity,
    });
    await expect(service.createCheckpoint('GLOBAL')).resolves.toEqual({
      status: 'SKIPPED_UNCHANGED',
    });
    expect(timestampRoot).not.toHaveBeenCalled();
  });

  it('checkpoints again once the head advances', async () => {
    const { service, timestampRoot } = makeService({
      verify: verifyResult({ headSeq: '9' }),
      latest: { headSeq: '5' } as AuditCheckpointEntity,
    });
    const res = await service.createCheckpoint('GLOBAL');
    expect(res.status).toBe('CREATED');
    expect(timestampRoot).toHaveBeenCalledTimes(1);
  });

  it('checkpointAllScopes iterates every distinct scope', async () => {
    const { service, timestampRoot } = makeService({
      verify: verifyResult({}),
      scopes: ['GLOBAL', 'tenant-a', 'tenant-b'],
    });

    const summary = await service.checkpointAllScopes();

    expect(summary).toEqual({ scopes: 3, created: 3, skipped: 0 });
    expect(timestampRoot).toHaveBeenCalledTimes(3);
  });

  describe('verifyScopeAnchored', () => {
    it('reports NO_CHECKPOINT when the scope has never been anchored', async () => {
      const { service } = makeService({
        verify: verifyResult({ headSeq: '9' }),
        latest: null,
      });
      const res = await service.verifyScopeAnchored('GLOBAL');
      expect(res.anchorStatus).toBe('NO_CHECKPOINT');
    });

    it('reports ANCHORED_OK when the chain matches and is not behind', async () => {
      const { service } = makeService({
        verify: verifyResult({ headSeq: '9' }),
        latest: validCheckpoint({ headSeq: '5', headHash: HEAD }),
        rowAtAnchor: { chainHash: HEAD },
        tokenValid: true,
      });
      const res = await service.verifyScopeAnchored('GLOBAL');
      expect(res.anchorStatus).toBe('ANCHORED_OK');
      expect(res.anchorReason).toBeNull();
      expect(res.checkpoint?.seq).toBe('5');
    });

    it('detects TRUNCATED when the head is behind the anchored seq', async () => {
      const { service } = makeService({
        verify: verifyResult({ headSeq: '3' }),
        latest: validCheckpoint({ headSeq: '5' }),
      });
      const res = await service.verifyScopeAnchored('GLOBAL');
      expect(res.anchorStatus).toBe('TRUNCATED');
    });

    it('detects TRUNCATED when the anchored row is gone', async () => {
      const { service } = makeService({
        verify: verifyResult({ headSeq: '9' }),
        latest: validCheckpoint({ headSeq: '5' }),
        rowAtAnchor: null,
      });
      const res = await service.verifyScopeAnchored('GLOBAL');
      expect(res.anchorStatus).toBe('TRUNCATED');
    });

    it('detects DIVERGED when the hash at the anchored seq differs', async () => {
      const { service } = makeService({
        verify: verifyResult({ headSeq: '9' }),
        latest: validCheckpoint({ headSeq: '5', headHash: HEAD }),
        rowAtAnchor: { chainHash: 'x'.repeat(64) },
      });
      const res = await service.verifyScopeAnchored('GLOBAL');
      expect(res.anchorStatus).toBe('DIVERGED');
    });

    it('reports CHECKPOINT_UNVERIFIED when the checkpoint token is invalid', async () => {
      const { service } = makeService({
        verify: verifyResult({ headSeq: '9' }),
        latest: validCheckpoint({ headSeq: '5' }),
        rowAtAnchor: { chainHash: HEAD },
        tokenValid: false,
      });
      const res = await service.verifyScopeAnchored('GLOBAL');
      expect(res.anchorStatus).toBe('CHECKPOINT_UNVERIFIED');
    });
  });
});
