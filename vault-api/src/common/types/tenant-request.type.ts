import type { Request } from 'express';
import type { TenantMemberRole } from '../../database/entities/tenant-member.entity';
import type { AuthUser } from './auth-user.type';
import type { TenantContext } from './tenant-context.type';

type RequestParams = Record<string, string>;
type RequestBody = unknown;

export type TenantRequest = Request<RequestParams, unknown, RequestBody> & {
  user?: AuthUser;
  tenantContext?: TenantContext;
  tenantRole?: TenantMemberRole;
};
