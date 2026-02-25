import { RoleName } from 'src/database/entities/role.entity';

export type JwtPayload = {
  sub: string;
  email: string;
  roles: RoleName[];
  iat?: number;
  exp?: number;
};
