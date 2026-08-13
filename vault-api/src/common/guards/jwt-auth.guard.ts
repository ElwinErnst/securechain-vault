import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { verifyZtRequest } from '../zt/zt-verify';
import { ReplayNonceService } from '../replay/replay-nonce.service';
import type { AuthUser } from '../types/auth-user.type';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly secret: string;
  private readonly maxSkewMs: number;

  constructor(
    config: ConfigService,
    private readonly replay: ReplayNonceService,
  ) {
    this.secret = config.getOrThrow<string>('zt.hmacSecret');
    this.maxSkewMs = config.get<number>('zt.maxClockSkewMs') ?? 30_000;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
    });

    if (!result.ok) {
      // Missing/invalid authentication is a 401, not a 403 (which is for an
      // authenticated caller lacking permission).
      throw new UnauthorizedException(
        `ZT: ${'reason' in result ? result.reason : 'verification failed'}`,
      );
    }

    // Signature is verified; now atomically record the nonce. A false return
    // means the key already existed → replay.
    const expiresAt = new Date(Date.now() + this.maxSkewMs);
    const fresh = await this.replay.checkAndRecord(result.replayKey, expiresAt);
    if (!fresh) {
      throw new UnauthorizedException('ZT: Replay detected');
    }

    req.user = {
      id: result.userId,
      roles: result.roles,
    };
    req.tenantContext = { tenantId: result.tenantId };

    return true;
  }
}
