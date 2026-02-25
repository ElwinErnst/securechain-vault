import { RoleName } from 'src/database/entities/role.entity';

export type AuthUser = {
  id: string;
  email: string;
  roles: RoleName[];
};
