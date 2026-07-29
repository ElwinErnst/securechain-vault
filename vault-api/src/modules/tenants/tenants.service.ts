import { Injectable, NotImplementedException } from '@nestjs/common';
import { TenantType } from '../../database/entities/tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { TenantResponseDto } from './dto/tenant-response.dto';
import { AuthDirectoryService } from '../../common/modules/auth-directory/auth-directory.service';

@Injectable()
export class TenantsService {
  constructor(private readonly authDirectory: AuthDirectoryService) {}

  async listMyTenants(userId: string): Promise<TenantResponseDto[]> {
    const rows = await this.authDirectory.listUserTenants(userId);

    return rows
      .filter((row) => row.isActive && row.membershipActive)
      .map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        type: TenantType.ORG,
        ownerUserId: null,
        role: row.role,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
  }

  createOrgTenant(
    dto: CreateTenantDto,
    ownerUserId: string,
  ): TenantResponseDto {
    void dto;
    void ownerUserId;
    throw new NotImplementedException(
      'Tenant creation has moved to auth-api; vault-api only consumes tenant directory data.',
    );
  }
}
