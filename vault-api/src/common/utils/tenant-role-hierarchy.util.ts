import { TenantMemberRole } from '../../database/entities/tenant-member.entity';

const RANK: Record<TenantMemberRole, number> = {
  [TenantMemberRole.MEMBER]: 1,
  [TenantMemberRole.ADMIN]: 2,
  [TenantMemberRole.OWNER]: 3,
};

export function hasAtLeastRole(
  actual: TenantMemberRole,
  required: TenantMemberRole,
): boolean {
  return RANK[actual] >= RANK[required];
}
