import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { loadTestEnv } from '../utils/test-env';
import { http } from '../utils/http';
import { resetDb, seedBase } from '../utils/db';

type LoginResponse = { accessToken: string; refreshToken: string };

function isLoginResponse(x: unknown): x is LoginResponse {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.accessToken === 'string' && typeof r.refreshToken === 'string'
  );
}

function asLoginResponse(body: unknown): LoginResponse {
  if (!isLoginResponse(body)) {
    throw new Error(
      'Invalid auth response shape (expected accessToken + refreshToken)',
    );
  }
  return body;
}

async function loginAndGetTokens(
  app: INestApplication,
  creds: { email: string; password: string },
): Promise<LoginResponse> {
  const res = await http(app).post('/auth/login').send(creds).expect(201);
  return asLoginResponse(res.body as unknown);
}

describe('Auth e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    loadTestEnv();

    const modRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modRef.createNestApplication();
    await app.init();

    await resetDb();
    await seedBase();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('login success returns accessToken + refreshToken', async () => {
    const tokens = await loginAndGetTokens(app, {
      email: 'admin@vault.local',
      password: '12345678',
    });

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
  });

  it('login fails with wrong password', async () => {
    await http(app)
      .post('/auth/login')
      .send({ email: 'admin@vault.local', password: 'wrongpass123' })
      .expect(401);
  });

  it('refresh rotates refresh token and returns new pair', async () => {
    const login = await loginAndGetTokens(app, {
      email: 'admin@vault.local',
      password: '12345678',
    });

    const refreshedRes = await http(app)
      .post('/auth/refresh')
      .send({ refreshToken: login.refreshToken })
      .expect(201);

    const refreshed = asLoginResponse(refreshedRes.body as unknown);

    expect(refreshed.accessToken).toBeTruthy();
    expect(refreshed.refreshToken).toBeTruthy();
    expect(refreshed.refreshToken).not.toBe(login.refreshToken);
  });

  it('reuse detection: using old refresh after rotation should fail (403/401 depending on your implementation)', async () => {
    const login = await loginAndGetTokens(app, {
      email: 'admin@vault.local',
      password: '12345678',
    });

    // rotate once
    await http(app)
      .post('/auth/refresh')
      .send({ refreshToken: login.refreshToken })
      .expect(201);

    // reuse old token should fail
    const res = await http(app)
      .post('/auth/refresh')
      .send({ refreshToken: login.refreshToken });

    expect([401, 403]).toContain(res.status);
  });

  it('logout revokes refresh token', async () => {
    const login = await loginAndGetTokens(app, {
      email: 'admin@vault.local',
      password: '12345678',
    });

    await http(app)
      .post('/auth/logout')
      .send({ refreshToken: login.refreshToken })
      .expect(201);

    const res = await http(app)
      .post('/auth/refresh')
      .send({ refreshToken: login.refreshToken });

    expect([401, 403]).toContain(res.status);
  });
});
