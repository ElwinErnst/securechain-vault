import type { Request } from 'express';
import type { AuthUser } from './auth-user.type';

export type RequestWithTenant = Request & {
  tenantContext?: { tenantId: string };
  user?: AuthUser;
};
