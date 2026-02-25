import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { AuditQueryDto } from './dto/audit-query.dto';

@Injectable()
export class AuditReaderService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  async listTenant(params: { tenantId: string; page: number; limit: number }) {
    const { tenantId, page, limit } = params;
    const qb = this.repo.createQueryBuilder('a');
    qb.andWhere('a.tenantId = :tenantId', { tenantId });
    qb.orderBy('a.createdAt', 'DESC').addOrderBy('a.seq', 'DESC');
    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return {
      page,
      limit,
      total,
      items,
    };
  }

  async search(params: {
    tenantId: string | null; // null => global (no filtra por tenant)
    q: AuditQueryDto;
  }) {
    const { tenantId, q } = params;

    const qb = this.repo.createQueryBuilder('a');

    if (tenantId !== null) {
      qb.andWhere('a.tenantId = :tenantId', { tenantId });
    }

    if (q.action) qb.andWhere('a.action = :action', { action: q.action });
    if (q.resourceType)
      qb.andWhere('a.resourceType = :rt', { rt: q.resourceType });
    if (q.resourceId) qb.andWhere('a.resourceId = :rid', { rid: q.resourceId });
    if (q.userId) qb.andWhere('a.userId = :uid', { uid: q.userId });
    if (q.outcome) qb.andWhere('a.outcome = :out', { out: q.outcome });

    if (q.from) qb.andWhere('a.createdAt >= :from', { from: new Date(q.from) });
    if (q.to) qb.andWhere('a.createdAt <= :to', { to: new Date(q.to) });

    qb.orderBy('a.createdAt', 'DESC').addOrderBy('a.seq', 'DESC');

    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const skip = (page - 1) * limit;

    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      page,
      limit,
      total,
      items,
    };
  }
}
