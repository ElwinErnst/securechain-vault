import { INestApplication, Controller, Get, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { loadTestEnv } from '../utils/test-env';
import { http } from '../utils/http';
import { resetDb, seedBase } from '../utils/db';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../src/common/guards/tenant-context.guard';
import { parseBody } from '../utils/parse';
import { LoginResponseSchema } from '../utils/schemas/auth.schemas';

@Controller('/__tenant')
class TenantProbeController {
  @UseGuards(JwtAuthGuard, TenantContextGuard)
  @Get('/probe')
  probe() {
    return { ok: true };
  }
}

describe('Tenant context hard-fail e2e', () => {
  let app: INestApplication;
  let token = '';
  let tenantId = '';

  beforeAll(async () => {
    loadTestEnv();
    await resetDb();
    const seeded = await seedBase();
    tenantId = seeded.tenant.id;

    const modRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TenantProbeController],
    }).compile();

    app = modRef.createNestApplication();
    await app.init();

    const loginRes = await http(app)
      .post('/auth/login')
      .send({ email: seeded.admin.email, password: seeded.admin.password })
      .expect(201);

    const tokens = parseBody(loginRes, LoginResponseSchema);
    token = tokens.accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('fails if x-tenant-id header missing', async () => {
    const res = await http(app)
      .get('/__tenant/probe')
      .set('Authorization', `Bearer ${token}`);

    expect([400, 403]).toContain(res.status);
  });

  it('passes with x-tenant-id', async () => {
    await http(app)
      .get('/__tenant/probe')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .expect(200);
  });
});
