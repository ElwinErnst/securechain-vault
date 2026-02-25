import type { Request } from 'express';
import type { AuthUser } from '../../modules/auth/types/auth-user.type';

export type RequestWithTenant = Request & {
  tenantId?: string;
  user?: AuthUser;
};
