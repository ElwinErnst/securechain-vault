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

function isLoginResponse(x: unknown): x is LoginResponse {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return typeof r.accessToken === 'string';
}

async function login(
  app: INestApplication,
  input: { email: string; password: string },
): Promise<string> {
  const res = await http(app).post('/auth/login').send(input).expect(201);

  const body: unknown = res.body;
  if (!isLoginResponse(body)) {
    throw new Error('Invalid /auth/login response shape');
  }
  return body.accessToken;
}

describe('RBAC e2e', () => {
  let app: INestApplication;

  let adminToken = '';
  let userToken = '';

  beforeAll(async () => {
    loadTestEnv();

    const modRef = await Test.createTestingModule({
      imports: [AppModule, TestOnlyModule],
    }).compile();

    app = modRef.createNestApplication();
    await app.init();

    await resetDb();
    const seeded = await seedBase();

    adminToken = await login(app, {
      email: seeded.admin.email,
      password: seeded.admin.password,
    });

    userToken = await login(app, {
      email: seeded.user.email,
      password: seeded.user.password,
    });
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
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('allows ADMIN to access admin-only', async () => {
    await http(app)
      .get('/__test/admin-only')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('denies USER for admin-only', async () => {
    await http(app)
      .get('/__test/admin-only')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });
});
