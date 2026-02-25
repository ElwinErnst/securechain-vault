import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { loadTestEnv } from '../utils/test-env';
import { http } from '../utils/http';
import { resetDb, seedBase } from '../utils/db';
import { parseBody } from '../utils/parse';
import { LoginResponseSchema } from '../utils/schemas/auth.schemas';
import {
  VaultResponseSchema,
  VaultsListSchema,
} from '../utils/schemas/vault.schemas';
describe('Vaults e2e', () => {
  let app: INestApplication;
  let adminToken = '';
  let userToken = '';
  let tenantId = '';

  beforeAll(async () => {
    loadTestEnv();
    await resetDb();
    const seeded = await seedBase();
    tenantId = seeded.tenant.id;

    const modRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modRef.createNestApplication();
    await app.init();

    const adminLoginRes = await http(app)
      .post('/auth/login')
      .send({ email: seeded.admin.email, password: seeded.admin.password })
      .expect(201);

    const adminTokens = parseBody(adminLoginRes, LoginResponseSchema);
    adminToken = adminTokens.accessToken;

    const userLoginRes = await http(app)
      .post('/auth/login')
      .send({ email: seeded.user.email, password: seeded.user.password })
      .expect(201);

    const userTokens = parseBody(userLoginRes, LoginResponseSchema);
    userToken = userTokens.accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('creates vault with auto slug', async () => {
    const res = await http(app)
      .post('/vaults')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', tenantId)
      .send({ name: 'Personal Vault' })
      .expect(201);

    const vault = parseBody(res, VaultResponseSchema);

    expect(vault.slug).toBe('personal-vault');
    expect(vault.tenantId).toBe(tenantId);
  });

  it('creates vault with explicit slug', async () => {
    const res = await http(app)
      .post('/vaults')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', tenantId)
      .send({ name: 'Docs', slug: 'docs' })
      .expect(201);

    const vault = parseBody(res, VaultResponseSchema);
    expect(vault.slug).toBe('docs');
  });

  it('rejects duplicate slug within same tenant', async () => {
    await http(app)
      .post('/vaults')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', tenantId)
      .send({ name: 'Dup', slug: 'dup' })
      .expect(201);

    await http(app)
      .post('/vaults')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', tenantId)
      .send({ name: 'Dup2', slug: 'dup' })
      .expect(409);
  });

  it('lists vaults', async () => {
    const res = await http(app)
      .get('/vaults')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    const vaults = parseBody(res, VaultsListSchema);

    expect(vaults.length).toBeGreaterThanOrEqual(1);
  });

  it('user can list vaults but not create', async () => {
    // user can list
    const listRes = await http(app)
      .get('/vaults')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .expect(200);

    const vaults = parseBody(listRes, VaultsListSchema);
    expect(vaults.length).toBeGreaterThanOrEqual(0);

    // user cannot create (403 Forbidden)
    await http(app)
      .post('/vaults')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', tenantId)
      .send({ name: 'user Vault' })
      .expect(403);
  });

  it('admin can create vaults', async () => {
    const res = await http(app)
      .post('/vaults')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', tenantId)
      .send({ name: 'Admin Vault' })
      .expect(201);

    const vault = parseBody(res, VaultResponseSchema);
    expect(vault.name).toBe('Admin Vault');
  });
});
