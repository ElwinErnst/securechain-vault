import { RoleName } from '../../../database/entities/role.entity';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: RoleName[];
}
