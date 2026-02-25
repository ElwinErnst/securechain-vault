import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantMemberRole } from '../../database/entities/tenant-member.entity';

type TenantRequest = { tenantRole?: TenantMemberRole };

export const CurrentTenantRole = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantMemberRole => {
    const req = ctx.switchToHttp().getRequest<TenantRequest>();
    if (!req.tenantRole)
      throw new Error('Missing tenantRole (tenant guard not applied)');
    return req.tenantRole;
  },
);
