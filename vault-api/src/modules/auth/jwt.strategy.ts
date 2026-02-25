import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './types/jwt-payload.type';
import { AuthUser } from './types/auth-user.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (!payload?.sub)
      throw new UnauthorizedException('Invalid JWT payload: missing sub');
    if (!Array.isArray(payload.roles) || payload.roles.length === 0)
      throw new UnauthorizedException('Invalid JWT payload: missing roles');
    return {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles,
    };
  }
}
