import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { AuthUser } from '../types/auth-user.type';

type TenantContext = { tenantId: string };

type TenantRequest = {
  user?: AuthUser;
  tenantContext?: TenantContext;
};

@Injectable()
export class TenantContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): true {
    const req = context.switchToHttp().getRequest<TenantRequest>();
    const tenantId = req.tenantContext?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Missing tenant context from ZT');
    }

    if (!isUUID(tenantId)) {
      throw new ForbiddenException('Invalid ZT tenant id');
    }

    req.tenantContext = { tenantId };
    return true;
  }
}
