import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  AuditLogEntity,
  AuditOutcome,
} from '../../database/entities/audit-log.entity';
import {
  AuditEventFields,
  computeChainHash,
  computeEventHash,
} from '../../common/utils/audit-canonical.util';

export type CreateAuditLogInput = {
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

@Injectable()
export class AuditService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  /**
   * Crea un audit log con:
   * - scope + seq monotónico
   * - eventHash + prevHash + chainHash (sha256)
   */
  async createChained(input: CreateAuditLogInput): Promise<AuditLogEntity> {
    const scope = input.tenantId ?? 'GLOBAL';

    return this.dataSource.transaction(async (manager) => {
      const r = manager.getRepository(AuditLogEntity);

      // Serialize writes within this scope BEFORE reading `last`, so two
      // concurrent transactions never both read seq=N and both insert seq=N+1
      // (which would race on the (scope, seq) unique constraint).
      // hashtext(scope) fits in int32; pg_advisory_xact_lock releases at COMMIT.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        scope,
      ]);

      const last = await r
        .createQueryBuilder('a')
        .where('a.scope = :scope', { scope })
        .orderBy('a.seq', 'DESC')
        .limit(1)
        .getOne();

      const nextSeq = last ? (BigInt(last.seq) + 1n).toString() : '1';
      const prevHash = last?.chainHash ?? null;

      // Canonical event fields — same source of truth the verifier recomputes
      // from. OJO: NO incluir datos sensibles ni objetos enormes.
      const fields: AuditEventFields = {
        scope,
        seq: nextSeq,
        tenantId: input.tenantId,
        userId: input.userId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        outcome: input.outcome,
        httpStatus: input.httpStatus,
        httpMethod: input.httpMethod,
        httpPath: input.httpPath,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: input.metadata,
      };

      const eventHash = computeEventHash(fields);
      const chainHash = computeChainHash(prevHash, eventHash);

      const row = r.create({
        ...input,
        scope,
        seq: nextSeq,
        prevHash,
        eventHash,
        chainHash,
      });

      return r.save(row);
    });
  }
}
