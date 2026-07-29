import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { verifyZtRequest } from '../zt/zt-verify';
import type { AuthUser } from '../types/auth-user.type';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly secret: string;
  private readonly maxSkewMs: number;
  private readonly replayCache = new Map<string, number>();

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('zt.hmacSecret');
    this.maxSkewMs = config.get<number>('zt.maxClockSkewMs') ?? 30_000;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<
      Request & {
        user?: AuthUser;
        tenantContext?: { tenantId: string };
      }
    >();

    const originalUrl = req.originalUrl ?? req.url ?? '/';
    const [path, queryPart] = originalUrl.split('?');

    const result = verifyZtRequest({
      secret: this.secret,
      method: req.method,
      path: path ?? '/',
      query: queryPart ?? '',
      headers: req.headers,
      maxSkewMs: this.maxSkewMs,
      replayCache: this.replayCache,
    });

    if (!result.ok) {
      throw new ForbiddenException(
        `ZT: ${'reason' in result ? result.reason : 'verification failed'}`,
      );
    }

    req.user = {
      id: result.userId,
      roles: result.roles,
    };
    req.tenantContext = { tenantId: result.tenantId };

    return true;
  }
}
