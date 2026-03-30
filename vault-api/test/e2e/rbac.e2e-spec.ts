import {
  INestApplication,
  Controller,
  Get,
  Module,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { loadTestEnv } from '../utils/test-env';
import { http } from '../utils/http';
import { resetDb, seedBase } from '../utils/db';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { Roles } from '../../src/common/decorators/roles.decorator';
import { RoleName } from '../../src/database/entities/role.entity';
import { buildZtHeaders } from '../utils/zt';

@Controller('/__test')
class TestProtectedController {
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN)
  @Get('/admin-only')
  adminOnly() {
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('/auth-only')
  authOnly() {
    return { ok: true };
  }
}

@Module({ controllers: [TestProtectedController] })
class TestOnlyModule {}

type LoginResponse = { accessToken: string };

describe('RBAC e2e', () => {
  let app: INestApplication;

  let adminUserId = '';
  let userId = '';
  let tenantId = '';

  beforeAll(async () => {
    loadTestEnv();

    const modRef = await Test.createTestingModule({
      imports: [AppModule, TestOnlyModule],
    }).compile();

    app = modRef.createNestApplication();
    await app.init();

    await resetDb();
    const seeded = await seedBase();
    adminUserId = seeded.admin.id;
    userId = seeded.user.id;
    tenantId = seeded.tenant.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('denies /__test/auth-only without token', async () => {
    await http(app).get('/__test/auth-only').expect(401);
  });

  it('allows /__test/auth-only with token', async () => {
    await http(app)
      .get('/__test/auth-only')
      .set(
        buildZtHeaders({
          method: 'GET',
          path: '/__test/auth-only',
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .expect(200);
  });

  it('allows ADMIN to access admin-only', async () => {
    await http(app)
      .get('/__test/admin-only')
      .set(
        buildZtHeaders({
          method: 'GET',
          path: '/__test/admin-only',
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .expect(200);
  });

  it('denies USER for admin-only', async () => {
    await http(app)
      .get('/__test/admin-only')
      .set(
        buildZtHeaders({
          method: 'GET',
          path: '/__test/admin-only',
          userId,
          tenantId,
          roles: ['USER'],
        }),
      )
      .expect(403);
  });
});
