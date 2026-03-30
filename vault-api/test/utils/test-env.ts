export function loadTestEnv(): void {
  process.env.NODE_ENV = 'test';

  // API
  process.env.PORT ??= '0'; // ephemeral port en tests
  process.env.ZT_HMAC_SECRET ??= 'test_zt_secret';
  process.env.ZT_MAX_CLOCK_SKEW_MS ??= '30000';

  // DB (ajustá si tu compose expone otro puerto)
  process.env.DB_HOST ??= '127.0.0.1';
  process.env.DB_PORT ??= '5433';
  process.env.DB_USER ??= 'vault';
  process.env.DB_PASSWORD ??= 'vault';
  process.env.DB_NAME ??= 'vault';

  // MinIO no es necesario para estos tests
}
