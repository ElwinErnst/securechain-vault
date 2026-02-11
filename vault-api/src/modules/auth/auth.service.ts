import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type { StringValue } from 'ms';
import * as argon2 from 'argon2';

import { UsersService } from '../users/users.service';
import { RefreshTokenEntity } from '../../database/entities/refresh-token.entity';
import { RoleName } from '../../database/entities/role.entity';
import { hashToken } from './utils/token-hash.util';
import { parseDurationToMs } from './utils/ms.util';

type LoginResult = { accessToken: string; refreshToken: string };

// ⚠️ NO usar "JwtPayload" para no chocar con jsonwebtoken
type AccessTokenPayload = {
  sub: string;
  email: string;
  roles: RoleName[];
};

type RefreshTokenPayload = AccessTokenPayload & {
  jti: string;
  fid: string; // family id
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshRepo: Repository<RefreshTokenEntity>,
  ) {}

  async validateUser(
    email: string,
    password: string,
  ): Promise<{ id: string; email: string }> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException();
    }

    return { id: user.id, email: user.email };
  }

  async login(user: { id: string; email: string }): Promise<LoginResult> {
    const roles = await this.usersService.getUserRoleNames(user.id);

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      roles,
    };

    const accessExpiresIn = (this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ??
      '15m') as StringValue;

    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessExpiresIn,
    });

    const refreshToken = await this.issueRefreshToken({
      userId: user.id,
      email: user.email,
      roles,
    });

    return { accessToken, refreshToken };
  }

  private async issueRefreshToken(input: {
    userId: string;
    email: string;
    roles: RoleName[];
    familyId?: string;
    userAgent?: string | null;
    ip?: string | null;
  }): Promise<string> {
    const familyId = input.familyId ?? randomUUID();
    const jti = randomUUID();

    const refreshExpiresInRaw =
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const refreshExpiresIn = refreshExpiresInRaw as StringValue;
    const expiresAt = new Date(
      Date.now() + parseDurationToMs(refreshExpiresInRaw),
    );

    const payload: RefreshTokenPayload = {
      sub: input.userId,
      email: input.email,
      roles: input.roles,
      jti,
      fid: familyId,
    };

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshExpiresIn,
    });

    await this.refreshRepo.insert({
      user_id: input.userId,
      family_id: familyId,
      jti,
      token_hash: hashToken(refreshToken),
      replaced_by: null,
      revoked_at: null,
      user_agent: input.userAgent ?? null,
      ip: input.ip ?? null,
      expires_at: expiresAt,
    });

    return refreshToken;
  }

  // 🔁 Rotación + reuse detection
  async refresh(
    refreshToken: string,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<LoginResult> {
    let decoded: RefreshTokenPayload;

    try {
      decoded = this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = hashToken(refreshToken);

    const existing = await this.refreshRepo.findOne({
      where: { jti: decoded.jti },
    });

    if (!existing) {
      throw new UnauthorizedException('Refresh token not recognized');
    }

    // reuse detection (token distinto con mismo jti)
    if (existing.token_hash !== tokenHash) {
      await this.revokeFamily(existing.family_id);
      throw new ForbiddenException('Refresh token reuse detected');
    }

    if (existing.revoked_at) {
      throw new ForbiddenException('Refresh token revoked');
    }

    if (existing.expires_at.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const userId = decoded.sub;
    const email = decoded.email;
    const roles = decoded.roles;

    // emitir nuevo refresh (misma familia)
    const newRefreshToken = await this.issueRefreshToken({
      userId,
      email,
      roles,
      familyId: existing.family_id,
      userAgent: meta?.userAgent ?? null,
      ip: meta?.ip ?? null,
    });

    // linkear replaced_by al nuevo registro (último creado en esa familia)
    const latest = await this.refreshRepo.findOne({
      where: {
        family_id: existing.family_id,
        revoked_at: undefined,
      },
      order: { created_at: 'DESC' },
    });

    await this.refreshRepo.update(
      { id: existing.id },
      { revoked_at: new Date(), replaced_by: latest?.id ?? null },
    );

    // access token nuevo
    const accessPayload: AccessTokenPayload = { sub: userId, email, roles };
    const accessExpiresIn = (this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ??
      '15m') as StringValue;

    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessExpiresIn,
    });

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string): Promise<{ ok: true }> {
    let decoded: RefreshTokenPayload;

    try {
      decoded = this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      return { ok: true };
    }

    const tokenHash = hashToken(refreshToken);
    const row = await this.refreshRepo.findOne({ where: { jti: decoded.jti } });

    if (row && row.token_hash === tokenHash && !row.revoked_at) {
      await this.refreshRepo.update({ id: row.id }, { revoked_at: new Date() });
    }

    return { ok: true };
  }

  async revokeAll(userId: string): Promise<{ ok: true }> {
    await this.refreshRepo
      .createQueryBuilder()
      .update(RefreshTokenEntity)
      .set({ revoked_at: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL')
      .execute();

    return { ok: true };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.refreshRepo
      .createQueryBuilder()
      .update(RefreshTokenEntity)
      .set({ revoked_at: new Date() })
      .where('family_id = :familyId', { familyId })
      .andWhere('revoked_at IS NULL')
      .execute();
  }
}
