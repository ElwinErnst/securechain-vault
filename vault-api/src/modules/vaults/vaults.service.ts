import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { VaultEntity } from '../../database/entities/vault.entity';
import { CreateVaultDto } from './dto/create-vault.dto';
import { VaultDto } from './dto/vault.dto';
import { slugify } from '../../common/utils/slugify.util';

@Injectable()
export class VaultsService {
  constructor(
    @InjectRepository(VaultEntity)
    private readonly vaultRepo: Repository<VaultEntity>,
  ) {}

  async create(tenantId: string, dto: CreateVaultDto): Promise<VaultDto> {
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
