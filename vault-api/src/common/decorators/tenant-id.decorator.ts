import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';

type TenantRequest = {
  tenantContext?: { tenantId: string };
};

export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<TenantRequest>();
    const tenantId = req.tenantContext?.tenantId;

    if (!tenantId)
      throw new InternalServerErrorException(
        'TenantContextGuard not applied: missing tenantContext',
      );
    return tenantId;
  },
);
