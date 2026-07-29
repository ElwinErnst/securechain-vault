import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { VaultEntity } from '../../database/entities/vault.entity';
import { DocumentEntity } from '../../database/entities/document.entity';
import { CreateVaultDto } from './dto/create-vault.dto';
import { VaultDto } from './dto/vault.dto';
import { slugify } from '../../common/utils/slugify.util';
import { AuthDirectoryService } from '../../common/modules/auth-directory/auth-directory.service';

@Injectable()
export class VaultsService {
  constructor(
    @InjectRepository(VaultEntity)
    private readonly vaultRepo: Repository<VaultEntity>,
    @InjectRepository(DocumentEntity)
    private readonly docsRepo: Repository<DocumentEntity>,
    private readonly authDirectory: AuthDirectoryService,
  ) {}

  async create(tenantId: string, dto: CreateVaultDto): Promise<VaultDto> {
    const tenant = await this.authDirectory.getTenant(tenantId);
    if (!tenant || !tenant.isActive) {
      throw new NotFoundException('Tenant not found');
    }

    const entitlements = tenant.entitlements;
    if (!entitlements.features.vaults) {
      throw new ForbiddenException(
        'Vaults are not enabled for this tenant plan',
      );
    }

    if (typeof entitlements.limits.maxVaults === 'number') {
      const currentVaults = await this.vaultRepo.count({ where: { tenantId } });
      if (currentVaults >= entitlements.limits.maxVaults) {
        throw new ConflictException(
          `Vault limit reached for plan ${entitlements.planCode}`,
        );
      }
    }

    const slug = (
      dto.slug?.trim().length ? dto.slug : slugify(dto.name)
    ).trim();

    if (!slug) {
      throw new ConflictException('Invalid slug');
    }

    const existing = await this.vaultRepo.findOne({
      where: { tenantId, slug },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Vault slug already exists in this tenant');
    }

    const entity = this.vaultRepo.create({
      tenantId,
      name: dto.name,
      slug,
      isDefault: false,
    });

    const saved = await this.vaultRepo.save(entity);
    return this.toDto(saved);
  }

  async list(tenantId: string): Promise<VaultDto[]> {
    const rows = await this.vaultRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });

    return rows.map((v) => this.toDto(v));
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const vault = await this.vaultRepo.findOne({
      where: { id, tenantId },
      select: { id: true, isDefault: true },
    });

    if (!vault) {
      throw new NotFoundException('Vault not found');
    }

    if (vault.isDefault) {
      throw new ConflictException('Default vault cannot be deleted');
    }

    const docsCount = await this.docsRepo.count({
      where: { tenantId, vaultId: id },
    });

    if (docsCount > 0) {
      throw new ConflictException(
        'Vault cannot be deleted while it still contains documents',
      );
    }

    await this.vaultRepo.delete({ id, tenantId });
  }

  private toDto(v: VaultEntity): VaultDto {
    return {
      id: v.id,
      tenantId: v.tenantId,
      name: v.name,
      slug: v.slug,
      isDefault: v.isDefault,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    };
  }
}
