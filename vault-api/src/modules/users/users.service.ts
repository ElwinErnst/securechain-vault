import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';

import { UserEntity } from '../../database/entities/user.entity';
import { RoleEntity, RoleName } from '../../database/entities/role.entity';
import { UserRoleEntity } from '../../database/entities/user-role.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,

    @InjectRepository(RoleEntity)
    private readonly rolesRepo: Repository<RoleEntity>,

    @InjectRepository(UserRoleEntity)
    private readonly userRolesRepo: Repository<UserRoleEntity>,
  ) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({ where: { email } });
  }

  async createUser(email: string, password: string): Promise<UserEntity> {
    const passwordHash = await argon2.hash(password);

    const user = this.usersRepo.create({
      email,
      passwordHash,
      isActive: true,
    });

    return this.usersRepo.save(user);
  }

  async ensureRole(name: RoleName): Promise<RoleEntity> {
    let role = await this.rolesRepo.findOne({ where: { name } });
    if (!role) {
      role = this.rolesRepo.create({ name });
      role = await this.rolesRepo.save(role);
    }
    return role;
  }

  async assignRole(user: UserEntity, role: RoleEntity): Promise<void> {
    const exists = await this.userRolesRepo.findOne({
      where: {
        user: { id: user.id },
        role: { id: role.id },
      },
      relations: ['user', 'role'],
    });

    if (!exists) {
      await this.userRolesRepo.save(this.userRolesRepo.create({ user, role }));
    }
  }

  async getUserRoleNames(userId: string): Promise<RoleName[]> {
    const rows = await this.userRolesRepo
      .createQueryBuilder('ur')
      .innerJoin('ur.role', 'r')
      .select(['r.name AS name'])
      .where('ur.user_id = :userId', { userId })
      .getRawMany<{ name: RoleName }>();

    return rows.map((r) => r.name);
  }
}
