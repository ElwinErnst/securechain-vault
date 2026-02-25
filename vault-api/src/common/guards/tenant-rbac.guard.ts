// tenant-rbac.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';

import { TENANT_ROLES_KEY } from '../decorators/tenant-roles.decorator';
import {
  TenantMemberEntity,
  TenantMemberRole,
} from '../../database/entities/tenant-member.entity';
import { hasAtLeastRole } from '../utils/tenant-role-hierarchy.util';

import { AUDIT_META_KEY, AuditMeta } from '../decorators/audit.decorator';
import { AuditService } from '../../modules/audit/audit.service';

type ReqParams = Record<string, string>;
type ReqBody = unknown;

type Req = Request<ReqParams, unknown, ReqBody> & {
  user?: { id: string };
  tenantContext?: { tenantId: string };
  tenantRole?: TenantMemberRole;
};

function getHeader(req: Request, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

function resolveIp(req: Request): string | null {
  const xff = getHeader(req, 'x-forwarded-for');
  if (xff && xff.length) return xff.split(',')[0]?.trim() ?? null;
  if (typeof req.ip === 'string' && req.ip.length) return req.ip;
  return null;
}

function resolveUserAgent(req: Request): string | null {
  return getHeader(req, 'user-agent') ?? null;
}

function resolvePath(req: Request): string {
  const raw = req.originalUrl || req.url || '';
  const base = raw.split('?')[0];
  return base || '';
}

@Injectable()
export class TenantRbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(TenantMemberEntity)
    private readonly tenantMembersRepo: Repository<TenantMemberEntity>,
    private readonly audit: AuditService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Req>();
    const required =
      this.reflector.getAllAndOverride<TenantMemberRole[]>(TENANT_ROLES_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? [];

    // Si el endpoint no declara roles → no aplica RBAC
    if (required.length === 0) return true;

    const tenantId = req.tenantContext?.tenantId ?? null;
    const userId = req.user?.id ?? null;

    if (!tenantId) {
      throw new ForbiddenException('Missing tenant context');
    }

    if (!userId) {
      throw new ForbiddenException('Missing auth user');
    }

    const membership = await this.tenantMembersRepo.findOne({
      where: { tenantId, userId },
      select: { role: true },
    });

    if (!membership) {
      throw new ForbiddenException('Not a tenant member');
    }

    // Permite usar @TenantRole()
    req.tenantRole = membership.role;

    const ok = required.some((minRole) =>
      hasAtLeastRole(membership.role, minRole),
    );

    if (!ok) {
      const meta =
        this.reflector.get<AuditMeta>(AUDIT_META_KEY, ctx.getHandler()) ??
        this.reflector.get<AuditMeta>(AUDIT_META_KEY, ctx.getClass()) ??
        null;

      const httpMethod = (req.method || 'GET').toUpperCase();
      const httpPath = resolvePath(req);

      if (meta?.auditOnError ?? true) {
        await this.audit.createChained({
          tenantId,
          userId,
          action: meta?.action ?? `${httpMethod} ${httpPath}`,
          resourceType: meta?.resourceType ?? 'http',
          resourceId: null,
          outcome: 'FAILURE',
          httpStatus: 403,
          httpMethod,
          httpPath,
          ip: resolveIp(req),
          userAgent: resolveUserAgent(req),
          metadata: {
            reason: 'Insufficient tenant role',
            required,
            actualRole: membership.role,
          },
        });
      }

      throw new ForbiddenException('Insufficient tenant role');
    }

    return true;
  }
}
