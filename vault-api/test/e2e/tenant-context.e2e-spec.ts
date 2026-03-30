import { INestApplication, Controller, Get, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { loadTestEnv } from '../utils/test-env';
import { http } from '../utils/http';
import { resetDb, seedBase } from '../utils/db';
import { TenantContextGuard } from '../../src/common/guards/tenant-context.guard';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { buildZtHeaders } from '../utils/zt';

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
  let adminUserId = '';
  let tenantId = '';

  beforeAll(async () => {
    loadTestEnv();

    const modRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TenantProbeController],
    }).compile();

    app = modRef.createNestApplication();
    await app.init();

    await resetDb();
    const seeded = await seedBase();
    tenantId = seeded.tenant.id;
    adminUserId = seeded.admin.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('fails if ZT headers are missing', async () => {
    await http(app).get('/__tenant/probe').expect(403);
  });

  it('passes with signed ZT tenant context', async () => {
    await http(app)
      .get('/__tenant/probe')
      .set(
        buildZtHeaders({
          method: 'GET',
          path: '/__tenant/probe',
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .expect(200);
  });
});
