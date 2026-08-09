import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { AuthDirectoryService } from '../../src/common/modules/auth-directory/auth-directory.service';
import { createFakeAuthDirectory } from '../utils/auth-directory.fake';
import { loadTestEnv } from '../utils/test-env';
import { http } from '../utils/http';
import { resetDb, seedBase } from '../utils/db';
import { parseBody } from '../utils/parse';
import {
  VaultResponseSchema,
  VaultsListSchema,
} from '../utils/schemas/vault.schemas';
import { buildZtHeaders } from '../utils/zt';
describe('Vaults e2e', () => {
  let app: INestApplication;
  let adminUserId = '';
  let userId = '';
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

    await resetDb();
    const seeded = await seedBase();
    tenantId = seeded.tenant.id;
    adminUserId = seeded.admin.id;
    userId = seeded.user.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('creates vault with auto slug', async () => {
    const res = await http(app)
      .post('/vaults')
      .set(
        buildZtHeaders({
          method: 'POST',
          path: '/vaults',
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .send({ name: 'Personal Vault' })
      .expect(201);

    const vault = parseBody(res, VaultResponseSchema);

    expect(vault.slug).toBe('personal-vault');
    expect(vault.tenantId).toBe(tenantId);
  });

  it('creates vault with explicit slug', async () => {
    const res = await http(app)
      .post('/vaults')
      .set(
        buildZtHeaders({
          method: 'POST',
          path: '/vaults',
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .send({ name: 'Docs', slug: 'docs' })
      .expect(201);

    const vault = parseBody(res, VaultResponseSchema);
    expect(vault.slug).toBe('docs');
  });

  it('rejects duplicate slug within same tenant', async () => {
    await http(app)
      .post('/vaults')
      .set(
        buildZtHeaders({
          method: 'POST',
          path: '/vaults',
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .send({ name: 'Dup', slug: 'dup' })
      .expect(201);

    await http(app)
      .post('/vaults')
      .set(
        buildZtHeaders({
          method: 'POST',
          path: '/vaults',
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .send({ name: 'Dup2', slug: 'dup' })
      .expect(409);
  });

  it('lists vaults', async () => {
    const res = await http(app)
      .get('/vaults')
      .set(
        buildZtHeaders({
          method: 'GET',
          path: '/vaults',
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .expect(200);

    const vaults = parseBody(res, VaultsListSchema);

    expect(vaults.length).toBeGreaterThanOrEqual(1);
  });

  it('user can list vaults but not create', async () => {
    // user can list
    const listRes = await http(app)
      .get('/vaults')
      .set(
        buildZtHeaders({
          method: 'GET',
          path: '/vaults',
          userId,
          tenantId,
          roles: ['USER'],
        }),
      )
      .expect(200);

    const vaults = parseBody(listRes, VaultsListSchema);
    expect(vaults.length).toBeGreaterThanOrEqual(0);

    // user cannot create (403 Forbidden)
    await http(app)
      .post('/vaults')
      .set(
        buildZtHeaders({
          method: 'POST',
          path: '/vaults',
          userId,
          tenantId,
          roles: ['USER'],
        }),
      )
      .send({ name: 'user Vault' })
      .expect(403);
  });

  it('admin can create vaults', async () => {
    const res = await http(app)
      .post('/vaults')
      .set(
        buildZtHeaders({
          method: 'POST',
          path: '/vaults',
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .send({ name: 'Admin Vault' })
      .expect(201);

    const vault = parseBody(res, VaultResponseSchema);
    expect(vault.name).toBe('Admin Vault');
  });
});
