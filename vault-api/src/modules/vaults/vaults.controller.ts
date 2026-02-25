import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { TenantRoles } from '../../common/decorators/tenant-roles.decorator';
import { TenantRbacGuard } from '../../common/guards/tenant-rbac.guard';

import { VaultsService } from './vaults.service';
import { CreateVaultDto } from './dto/create-vault.dto';
import { VaultDto } from './dto/vault.dto';
import { TenantMemberRole } from '../../database/entities/tenant-member.entity';
import { Audit } from 'src/common/decorators/audit.decorator';

@UseGuards(JwtAuthGuard, TenantContextGuard, TenantRbacGuard)
@Controller('vaults')
export class VaultsController {
  constructor(private readonly vaultsService: VaultsService) {}

  @Post()
  @Audit({
    action: 'VAULT_CREATE',
    resourceType: 'vault',
  })
  @TenantRoles(TenantMemberRole.ADMIN)
  create(
    @TenantId() tenantId: string,
    @Body() dto: CreateVaultDto,
  ): Promise<VaultDto> {
    return this.vaultsService.create(tenantId, dto);
  }

  @Get()
  @TenantRoles(TenantMemberRole.MEMBER)
  @Audit({
    action: 'VAULT_LIST',
    resourceType: 'vault',
  })
  list(@TenantId() tenantId: string): Promise<VaultDto[]> {
    return this.vaultsService.list(tenantId);
  }
}
