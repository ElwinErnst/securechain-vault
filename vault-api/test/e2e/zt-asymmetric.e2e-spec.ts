import { INestApplication, Controller, Get, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';

// The verification keyring is read at config load (app init), so the trusted
// public key must be in the environment before the module is created.
import { ztTestPublicKeysJson } from '../utils/zt';
process.env.ZT_VERIFY_PUBLIC_KEYS = ztTestPublicKeysJson;

import { AppModule } from '../../src/app.module';
import { AuthDirectoryService } from '../../src/common/modules/auth-directory/auth-directory.service';
import { createFakeAuthDirectory } from '../utils/auth-directory.fake';
import { loadTestEnv } from '../utils/test-env';
import { http } from '../utils/http';
import { resetDb, seedBase } from '../utils/db';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { buildZtHeaders, buildZtV2Headers } from '../utils/zt';

@Controller('/__zt')
class ZtProbeController {
  @UseGuards(JwtAuthGuard)
  @Get('/probe')
  probe() {
    return { ok: true };
  }
}

describe('ZT asymmetric (Ed25519) guard e2e', () => {
  let app: INestApplication;
  let userId = '';
  let tenantId = '';

  beforeAll(async () => {
    loadTestEnv();

    const modRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ZtProbeController],
    })
      .overrideProvider(AuthDirectoryService)
      .useValue(createFakeAuthDirectory())
      .compile();

    app = modRef.createNestApplication();
    await app.init();

    await resetDb();
    const seeded = await seedBase();
    tenantId = seeded.tenant.id;
    userId = seeded.admin.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('accepts a valid v2 (Ed25519) request', async () => {
    await http(app)
      .get('/__zt/probe')
      .set(
        buildZtV2Headers({
          method: 'GET',
          path: '/__zt/probe',
          userId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .expect(200);
  });

  it('rejects a replayed v2 nonce on the second use', async () => {
    const headers = buildZtV2Headers({
      method: 'GET',
      path: '/__zt/probe',
      userId,
      tenantId,
      roles: ['ADMIN'],
    });

    await http(app).get('/__zt/probe').set(headers).expect(200);
    await http(app).get('/__zt/probe').set(headers).expect(401);
  });

  it('rejects an unknown key id', async () => {
    await http(app)
      .get('/__zt/probe')
      .set(
        buildZtV2Headers({
          method: 'GET',
          path: '/__zt/probe',
          userId,
          tenantId,
          roles: ['ADMIN'],
          kid: 'not-in-keyring',
        }),
      )
      .expect(401);
  });

  it('still accepts a valid v1 (HMAC) request during migration', async () => {
    await http(app)
      .get('/__zt/probe')
      .set(
        buildZtHeaders({
          method: 'GET',
          path: '/__zt/probe',
          userId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .expect(200);
  });
});
