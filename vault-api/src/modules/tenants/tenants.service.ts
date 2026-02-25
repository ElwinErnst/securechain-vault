import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TenantEntity,
  TenantType,
} from '../../database/entities/tenant.entity';
import {
  TenantMemberEntity,
  TenantMemberRole,
} from '../../database/entities/tenant-member.entity';
import { VaultEntity } from '../../database/entities/vault.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { TenantResponseDto } from './dto/tenant-response.dto';
import { slugify } from '../../common/utils/slugify.util';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantsRepo: Repository<TenantEntity>,
    @InjectRepository(TenantMemberEntity)
    private readonly membersRepo: Repository<TenantMemberEntity>,
    @InjectRepository(VaultEntity)
    private readonly vaultsRepo: Repository<VaultEntity>,
  ) {}

  async listMyTenants(userId: string): Promise<TenantResponseDto[]> {
    const rows = await this.membersRepo
      .createQueryBuilder('m')
      .innerJoin('tenants', 't', 't.id = m.tenant_id')
      .where('m.user_id = :userId', { userId })
      .select([
        't.id as id',
        't.name as name',
        't.slug as slug',
        't.type as type',
        't.owner_user_id as "ownerUserId"',
        'm.role as role', // 👈 nuevo
        't.created_at as "createdAt"',
        't.updated_at as "updatedAt"',
      ])
      .orderBy('t.created_at', 'DESC')
      .getRawMany<TenantResponseDto>();

    return rows.map((r) => ({
      ...r,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    }));
  }

  async createOrgTenant(
    dto: CreateTenantDto,
    ownerUserId: string,
  ): Promise<TenantResponseDto> {
    const existing = await this.tenantsRepo.findOne({
      where: { slug: dto.slug },
      select: { id: true },
    });
    if (existing) throw new ConflictException('slug already exists');

    return this.tenantsRepo.manager.transaction(async (trx) => {
      const tenant = await trx.getRepository(TenantEntity).save({
        name: dto.name,
        slug: dto.slug,
        type: TenantType.ORG,
        ownerUserId: ownerUserId,
      });

      await trx.getRepository(TenantMemberEntity).save({
        tenantId: tenant.id,
        userId: ownerUserId,
        role: TenantMemberRole.OWNER,
      });

      await trx.getRepository(VaultEntity).save({
        tenantId: tenant.id,
        name: `${tenant.name} Vault`,
        slug: slugify(`${tenant.name} Vault`),
        isDefault: true,
      });

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        type: tenant.type,
        ownerUserId: tenant.ownerUserId,
        createdAt: tenant.createdAt.toISOString(),
        updatedAt: tenant.updatedAt.toISOString(),
      };
    });
  }
}
