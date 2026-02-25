// tenant-roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { TenantMemberRole } from '../../database/entities/tenant-member.entity';

export const TENANT_ROLES_KEY = 'tenant_roles';
export const TenantRoles = (...roles: TenantMemberRole[]) =>
  SetMetadata(TENANT_ROLES_KEY, roles);
