import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { loadTestEnv } from '../utils/test-env';
import { http } from '../utils/http';
import { resetDb, seedBase } from '../utils/db';
import { parseBody } from '../utils/parse';
import {
  LoginResponseSchema,
  TenantResponseSchema,
  TenantsListSchema,
} from '../utils/schemas/auth.schemas';

describe('Tenants e2e', () => {
  let app: INestApplication;
  let adminToken = '';

  beforeAll(async () => {
    loadTestEnv();

    const modRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modRef.createNestApplication();
    await app.init();

    // Reset and seed after app init so TypeORM has created the tables
    await resetDb();
    const seeded = await seedBase();

    const loginRes = await http(app)
      .post('/auth/login')
      .send({ email: seeded.admin.email, password: seeded.admin.password })
      .expect(201);

    const tokens = parseBody(loginRes, LoginResponseSchema);
    adminToken = tokens.accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('lists tenants for user (at least 1)', async () => {
    const res = await http(app)
      .get('/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const tenants = parseBody(res, TenantsListSchema);
    expect(tenants.length).toBeGreaterThanOrEqual(1);
  });

  it('creates tenant', async () => {
    const res = await http(app)
      .post('/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Beta', slug: 'beta', type: 'ORG' })
      .expect(201);

    const created = parseBody(res, TenantResponseSchema);
    expect(created.id).toBeTruthy();
    expect(created.slug).toBe('beta');
  });

  it('rejects duplicate tenant slug', async () => {
    await http(app)
      .post('/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dup', slug: 'dup', type: 'ORG' })
      .expect(201);

    await http(app)
      .post('/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dup2', slug: 'dup', type: 'ORG' })
      .expect(409);
  });
});
