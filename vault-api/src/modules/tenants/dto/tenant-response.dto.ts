import { TenantType } from '../../../database/entities/tenant.entity';
import { TenantMemberRole } from '../../../database/entities/tenant-member.entity';

export class TenantResponseDto {
  id!: string;
  name!: string;
  slug!: string;
  type!: TenantType;
  ownerUserId!: string | null;
  role?: TenantMemberRole;
  createdAt!: string;
  updatedAt!: string;
}
