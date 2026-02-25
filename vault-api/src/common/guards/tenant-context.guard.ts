import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { isUUID } from 'class-validator';

type TenantContext = { tenantId: string };

type TenantRequest = {
  headers: Record<string, string | string[] | undefined>;
  tenantContext?: TenantContext;
};

@Injectable()
export class TenantContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): true {
    const req = context.switchToHttp().getRequest<TenantRequest>();

    const raw = req.headers['x-tenant-id'];
    const tenantId = Array.isArray(raw) ? raw[0] : raw;

    if (!tenantId) {
      throw new BadRequestException('Missing x-tenant-id header');
    }

    if (!isUUID(tenantId)) {
      throw new BadRequestException('Invalid x-tenant-id');
    }

    req.tenantContext = { tenantId };
    return true;
  }
}
