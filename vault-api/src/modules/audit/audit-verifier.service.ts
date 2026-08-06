import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import {
  ChainVerifyResult,
  ChainState,
  initialChainState,
  stepChain,
} from './audit-chain';

@Injectable()
export class AuditVerifierService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  /**
   * Walk a scope's chain in ascending seq order and report the first break.
   *
   * Rows are streamed in seq-keyed batches so a large scope never has to be
   * loaded into memory at once. The pure `stepChain` reducer carries the state
   * across batches.
   */
  async verifyScope(scope: string, batchSize = 1000): Promise<ChainVerifyResult> {
    let state: ChainState = initialChainState();
    let cursor: string | null = null;
    let headHash: string | null = null;

    for (;;) {
      const qb = this.repo
        .createQueryBuilder('a')
        .where('a.scope = :scope', { scope });

      if (cursor !== null) {
        qb.andWhere('a.seq > :cursor', { cursor });
      }

      const rows = await qb.orderBy('a.seq', 'ASC').take(batchSize).getMany();
      if (rows.length === 0) break;

      for (const row of rows) {
        const res = stepChain(state, row);
        if (res.firstBreak) {
          return {
            scope,
            status: 'BROKEN',
            checked: state.checked,
            headSeq: state.headSeq,
            headHash,
            firstBreak: res.firstBreak,
          };
        }
        state = res.state;
        headHash = row.chainHash;
        cursor = row.seq;
      }

      if (rows.length < batchSize) break;
    }

    if (state.checked === 0) {
      return {
        scope,
        status: 'EMPTY',
        checked: 0,
        headSeq: null,
        headHash: null,
        firstBreak: null,
      };
    }

    return {
      scope,
      status: 'VALID',
      checked: state.checked,
      headSeq: state.headSeq,
      headHash,
      firstBreak: null,
    };
  }
}
