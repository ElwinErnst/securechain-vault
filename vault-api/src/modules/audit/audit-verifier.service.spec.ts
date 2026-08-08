import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { AuditVerifierService } from './audit-verifier.service';

describe('AuditVerifierService', () => {
  it('reads all verification batches in one REPEATABLE READ transaction', async () => {
    const getMany = jest.fn().mockResolvedValue([]);
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany,
    };
    const txRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as Repository<AuditLogEntity>;
    const manager = {
      getRepository: jest.fn().mockReturnValue(txRepo),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(
        async (isolation: string, work: (m: EntityManager) => unknown) => {
          expect(isolation).toBe('REPEATABLE READ');
          return work(manager);
        },
      ),
    } as unknown as DataSource;

    const service = new AuditVerifierService(dataSource);
    await expect(service.verifyScope('tenant-A', 10)).resolves.toMatchObject({
      status: 'EMPTY',
    });
    expect(manager.getRepository).toHaveBeenCalledWith(AuditLogEntity);
    expect((dataSource.transaction as jest.Mock).mock.calls).toHaveLength(1);
  });
});
