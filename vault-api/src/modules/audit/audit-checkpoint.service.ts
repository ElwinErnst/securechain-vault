import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';

import { AuditCheckpointEntity } from '../../database/entities/audit-checkpoint.entity';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { AuditVerifierService } from './audit-verifier.service';
import type { ChainVerifyResult } from './audit-chain';
import {
  TIMESTAMP_CLIENT,
  type TimestampClientPort,
} from '../../common/modules/timestamp/timestamp-client.port';
import {
  TIMESTAMP_VERIFIER,
  type TimestampVerifierPort,
} from '../../common/modules/timestamp/timestamp-verifier.port';

/**
 * Canonical hash timestamped for a checkpoint. Binds the scope, the head seq and
 * the head chain-hash together so the token attests exactly this head. Both the
 * writer and the verifier MUST derive the value the same way.
 */
export function computeCheckpointHash(
  scope: string,
  headSeq: string,
  headHash: string,
): string {
  return createHash('sha256')
    .update(`${scope}\n${headSeq}\n${headHash}`)
    .digest('hex');
}

export type CheckpointResult =
  | { status: 'CREATED'; checkpoint: AuditCheckpointEntity }
  | { status: 'SKIPPED_UNCHANGED' | 'SKIPPED_EMPTY' | 'SKIPPED_BROKEN' };

/**
 * NO_CHECKPOINT        — no anchored checkpoint exists yet for this scope.
 * ANCHORED_OK          — the chain is consistent with, and no shorter than, the anchor.
 * TRUNCATED            — the chain is behind the anchored head (newest rows deleted).
 * DIVERGED             — the chain hash at the anchored seq differs (history rewritten).
 * CHECKPOINT_UNVERIFIED — the checkpoint itself can't be trusted (bad token/fields).
 */
export type AnchorCheckStatus =
  | 'NO_CHECKPOINT'
  | 'ANCHORED_OK'
  | 'TRUNCATED'
  | 'DIVERGED'
  | 'CHECKPOINT_UNVERIFIED';

export type AnchoredCheckpointView = {
  seq: string;
  headHash: string;
  timestampedAt: Date | null;
  tsaSerial: string | null;
};

export type AnchoredVerifyResult = ChainVerifyResult & {
  checkpoint: AnchoredCheckpointView | null;
  anchorStatus: AnchorCheckStatus;
  anchorReason: string | null;
};

@Injectable()
export class AuditCheckpointService {
  private readonly logger = new Logger(AuditCheckpointService.name);

  constructor(
    @InjectRepository(AuditCheckpointEntity)
    private readonly repo: Repository<AuditCheckpointEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
    private readonly verifier: AuditVerifierService,
    @Inject(TIMESTAMP_CLIENT)
    private readonly timestampClient: TimestampClientPort,
    @Inject(TIMESTAMP_VERIFIER)
    private readonly tokenVerifier: TimestampVerifierPort,
  ) {}

  /**
   * Internal chain verification PLUS the anchored-checkpoint check that closes
   * the newest-suffix-truncation gap. A chain that verifies internally but is
   * behind (or inconsistent with) the latest anchored head is reported as
   * TRUNCATED / DIVERGED.
   */
  async verifyScopeAnchored(scope: string): Promise<AnchoredVerifyResult> {
    const chain = await this.verifier.verifyScope(scope);

    const checkpoint = await this.repo.findOne({
      where: { scope, status: 'TIMESTAMPED' },
      order: { createdAt: 'DESC' },
    });

    if (!checkpoint) {
      return {
        ...chain,
        checkpoint: null,
        anchorStatus: 'NO_CHECKPOINT',
        anchorReason: 'No anchored checkpoint exists for this scope',
      };
    }

    const view: AnchoredCheckpointView = {
      seq: checkpoint.headSeq,
      headHash: checkpoint.headHash,
      timestampedAt: checkpoint.timestampedAt,
      tsaSerial: checkpoint.tsaSerial,
    };

    // 1. Trust the checkpoint itself: its fields must match its hash, and the
    //    RFC 3161 token must verify over that hash.
    const expectedHash = computeCheckpointHash(
      scope,
      checkpoint.headSeq,
      checkpoint.headHash,
    );
    if (
      checkpoint.checkpointHash !== expectedHash ||
      !checkpoint.timestampTokenB64
    ) {
      return {
        ...chain,
        checkpoint: view,
        anchorStatus: 'CHECKPOINT_UNVERIFIED',
        anchorReason: 'Checkpoint fields do not match its recorded hash',
      };
    }
    const tokenCheck = await this.tokenVerifier.verifyToken(
      checkpoint.timestampTokenB64,
      checkpoint.checkpointHash,
    );
    if (!tokenCheck.valid) {
      return {
        ...chain,
        checkpoint: view,
        anchorStatus: 'CHECKPOINT_UNVERIFIED',
        anchorReason: `Checkpoint token failed verification: ${tokenCheck.reason ?? 'unknown'}`,
      };
    }

    // 2. The chain must not be behind the anchored head.
    const anchoredSeq = BigInt(checkpoint.headSeq);
    if (chain.headSeq === null || BigInt(chain.headSeq) < anchoredSeq) {
      return {
        ...chain,
        checkpoint: view,
        anchorStatus: 'TRUNCATED',
        anchorReason: `Chain head is behind the anchored checkpoint (seq ${checkpoint.headSeq})`,
      };
    }

    // 3. The chain's row at the anchored seq must carry the anchored hash.
    const rowAtAnchor = await this.auditRepo.findOne({
      where: { scope, seq: checkpoint.headSeq },
    });
    if (!rowAtAnchor) {
      return {
        ...chain,
        checkpoint: view,
        anchorStatus: 'TRUNCATED',
        anchorReason: `Anchored row (seq ${checkpoint.headSeq}) is missing`,
      };
    }
    if (rowAtAnchor.chainHash !== checkpoint.headHash) {
      return {
        ...chain,
        checkpoint: view,
        anchorStatus: 'DIVERGED',
        anchorReason: `Chain hash at anchored seq ${checkpoint.headSeq} differs from the checkpoint`,
      };
    }

    return {
      ...chain,
      checkpoint: view,
      anchorStatus: 'ANCHORED_OK',
      anchorReason: null,
    };
  }

  /** Distinct audit scopes present in the log (e.g. 'GLOBAL' and each tenant id). */
  async listScopes(): Promise<string[]> {
    const rows = await this.auditRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.scope', 'scope')
      .getRawMany<{ scope: string }>();
    return rows.map((r) => r.scope);
  }

  /** Checkpoint every scope. Returns a tally for logging. */
  async checkpointAllScopes(): Promise<{
    scopes: number;
    created: number;
    skipped: number;
  }> {
    const scopes = await this.listScopes();
    let created = 0;
    let skipped = 0;

    for (const scope of scopes) {
      const res = await this.createCheckpoint(scope);
      if (res.status === 'CREATED') created += 1;
      else skipped += 1;
    }

    return { scopes: scopes.length, created, skipped };
  }

  /**
   * Validate a scope's chain and anchor its head externally. Skips when there is
   * nothing to anchor (empty), when the chain is broken (never anchor a bad
   * head), or when the head has not advanced since the last checkpoint.
   */
  async createCheckpoint(scope: string): Promise<CheckpointResult> {
    const result = await this.verifier.verifyScope(scope);

    if (result.status === 'EMPTY') {
      return { status: 'SKIPPED_EMPTY' };
    }
    if (result.status === 'BROKEN' || !result.headSeq || !result.headHash) {
      this.logger.error(
        `Refusing to checkpoint scope=${scope}: chain is broken`,
      );
      return { status: 'SKIPPED_BROKEN' };
    }

    const { headSeq, headHash } = result;

    const latest = await this.repo.findOne({
      where: { scope },
      order: { createdAt: 'DESC' },
    });
    if (latest && BigInt(latest.headSeq) >= BigInt(headSeq)) {
      return { status: 'SKIPPED_UNCHANGED' };
    }

    const checkpointHash = computeCheckpointHash(scope, headSeq, headHash);
    const ts = await this.timestampClient.timestampRoot(checkpointHash);

    const checkpoint = await this.repo.save(
      this.repo.create({
        scope,
        headSeq,
        headHash,
        checkpointHash,
        status: ts.simulated ? 'SIMULATED' : 'TIMESTAMPED',
        timestampTokenB64: ts.tokenB64,
        tsaUrl: ts.tsaUrl,
        tsaSerial: ts.serial,
        timestampedAt: ts.simulated ? null : ts.timestampedAt,
      }),
    );

    this.logger.log(
      `Checkpointed scope=${scope} seq=${headSeq} status=${checkpoint.status}`,
    );
    return { status: 'CREATED', checkpoint };
  }
}
