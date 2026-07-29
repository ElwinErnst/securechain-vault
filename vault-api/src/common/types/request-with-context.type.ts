import type { Request } from 'express';
import type { TenantContext } from './tenant-context.type';

type RequestParams = Record<string, string>;
type RequestBody = unknown;

export type RequestWithContext = Request<
  RequestParams,
  unknown,
  RequestBody
> & {
  tenantContext?: TenantContext;
  user?: { id: string };
};
