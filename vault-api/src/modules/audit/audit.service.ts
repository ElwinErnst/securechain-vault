import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  AuditLogEntity,
  AuditOutcome,
} from '../../database/entities/audit-log.entity';
import { sha256Hex, stableStringify } from '../../common/utils/audit-hash.util';

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

      // Tomamos el último evento del scope con lock de escritura
      const last = await r
        .createQueryBuilder('a')
        .setLock('pessimistic_write')
        .where('a.scope = :scope', { scope })
        .orderBy('a.seq', 'DESC')
        .limit(1)
        .getOne();

      const nextSeq = last ? (BigInt(last.seq) + 1n).toString() : '1';
      const prevHash = last?.chainHash ?? null;

      // Construimos payload estable para el eventHash
      // OJO: NO incluir datos sensibles ni objetos enormes
      const eventPayload = {
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

      const eventHash = sha256Hex(stableStringify(eventPayload));
      const chainHash = sha256Hex(`${prevHash ?? ''}|${eventHash}`);

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
