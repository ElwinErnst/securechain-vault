import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { AuthDirectoryService } from '../../src/common/modules/auth-directory/auth-directory.service';
import { createFakeAuthDirectory } from '../utils/auth-directory.fake';
import { loadTestEnv } from '../utils/test-env';
import { http } from '../utils/http';
import { resetDb, seedBase } from '../utils/db';
import { parseBody } from '../utils/parse';
import { TenantsListSchema } from '../utils/schemas/auth.schemas';
import { buildZtHeaders } from '../utils/zt';

describe('Tenants e2e', () => {
  let app: INestApplication;
  let adminUserId = '';
  let tenantId = '';

  beforeAll(async () => {
    loadTestEnv();

    const modRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthDirectoryService)
      .useValue(createFakeAuthDirectory())
      .compile();

    app = modRef.createNestApplication();
    await app.init();

    // Reset and seed after app init so TypeORM has created the tables
    await resetDb();
    const seeded = await seedBase();
    adminUserId = seeded.admin.id;
    tenantId = seeded.tenant.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('lists tenants for user (at least 1)', async () => {
    const res = await http(app)
      .get('/tenants')
      .set(
        buildZtHeaders({
          method: 'GET',
          path: '/tenants',
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .expect(200);

    const tenants = parseBody(res, TenantsListSchema);
    expect(tenants.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /tenants is deprecated (tenant creation moved to auth-api)', async () => {
    await http(app)
      .post('/tenants')
      .set(
        buildZtHeaders({
          method: 'POST',
          path: '/tenants',
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .send({ name: 'Beta', slug: 'beta', type: 'ORG' })
      .expect(409);
  });
});
