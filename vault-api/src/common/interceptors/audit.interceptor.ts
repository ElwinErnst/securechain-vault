// src/common/interceptors/audit.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, catchError, from, mergeMap, throwError } from 'rxjs';
import type { Request, Response } from 'express';

import { AuditService } from '../../modules/audit/audit.service';
import { AUDIT_META_KEY, AuditMeta } from '../decorators/audit.decorator';
import type { RequestWithContext } from '../types/request-with-context.type';

function safeGet(obj: unknown, path: string): unknown {
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = obj;

  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }

  return cur;
}

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

function getStatusFromError(err: unknown): number {
  if (typeof err === 'object' && err !== null) {
    const maybe = err as { getStatus?: unknown };
    if (typeof maybe.getStatus === 'function') {
      const v = (maybe.getStatus as () => unknown)();
      return typeof v === 'number' ? v : 500;
    }
  }
  return 500;
}

function getErrorName(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const maybe = err as { name?: unknown };
    if (typeof maybe.name === 'string' && maybe.name.length) return maybe.name;
  }
  return 'Error';
}

function getErrorMessage(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null) {
    const maybe = err as { message?: unknown };
    if (typeof maybe.message === 'string' && maybe.message.length)
      return maybe.message;
  }
  return undefined;
}

function unknownToStringId(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return JSON.stringify(v);
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<RequestWithContext>();
    const res = httpCtx.getResponse<Response>();

    const meta =
      this.reflector.get<AuditMeta>(AUDIT_META_KEY, context.getHandler()) ??
      this.reflector.get<AuditMeta>(AUDIT_META_KEY, context.getClass()) ??
      null;

    // Tenant + user context (según tus guards/decorators)
    const tenantId = req.tenantContext?.tenantId ?? null;
    const userId = req.user?.id ?? null;

    const httpMethod = (req.method || 'GET').toUpperCase();
    const httpPath = resolvePath(req);

    const resolveResourceId = (): string | null => {
      if (!meta) return null;

      if (meta.resourceIdParam) {
        const raw = (req.params as Record<string, unknown>)[
          meta.resourceIdParam
        ];
        return unknownToStringId(raw);
      }

      if (meta.resourceIdBodyPath) {
        const raw = safeGet(req.body, meta.resourceIdBodyPath);
        return unknownToStringId(raw);
      }

      return null;
    };

    const action = meta?.action ?? `${httpMethod} ${httpPath}`;
    const resourceType = meta?.resourceType ?? 'http';
    const resourceId = resolveResourceId();

    const mergeMetadata = (
      extra?: Record<string, unknown> | null,
    ): Record<string, unknown> | null => {
      const m1 = meta?.metadata ?? null;
      const m2 = extra ?? null;
      if (!m1 && !m2) return null;
      return { ...(m1 ?? {}), ...(m2 ?? {}) };
    };

    const base = {
      tenantId,
      userId,
      action,
      resourceType,
      resourceId,
      httpMethod,
      httpPath,
      ip: resolveIp(req),
      userAgent: resolveUserAgent(req),
    };

    return next.handle().pipe(
      mergeMap((data: unknown) => {
        const httpStatus =
          typeof res.statusCode === 'number' ? res.statusCode : 200;

        const metadata = mergeMetadata({
          resourceIdResolved: Boolean(resourceId),
        });

        return from(
          this.audit.createChained({
            ...base,
            outcome: 'SUCCESS',
            httpStatus,
            metadata,
          }),
        ).pipe(mergeMap(() => [data]));
      }),
      catchError((err: unknown) => {
        const auditOnError = meta?.auditOnError ?? true;
        if (!auditOnError) return throwError(() => err);

        const status = getStatusFromError(err);

        const metadata = mergeMetadata({
          errorName: getErrorName(err),
          errorMessage: getErrorMessage(err),
        });

        return from(
          this.audit.createChained({
            ...base,
            outcome: 'FAILURE',
            httpStatus: status,
            metadata,
          }),
        ).pipe(mergeMap(() => throwError(() => err)));
      }),
    );
  }
}
