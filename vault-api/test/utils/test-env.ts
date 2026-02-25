export function loadTestEnv(): void {
  process.env.NODE_ENV = 'test';

  // API
  process.env.PORT ??= '0'; // ephemeral port en tests
  process.env.JWT_ACCESS_SECRET ??= 'test_access_secret';
  process.env.JWT_REFRESH_SECRET ??= 'test_refresh_secret';
  process.env.JWT_ACCESS_EXPIRES_IN ??= '15m';
  process.env.JWT_REFRESH_EXPIRES_IN ??= '7d';

  // DB (ajustá si tu compose expone otro puerto)
  process.env.DB_HOST ??= '127.0.0.1';
  process.env.DB_PORT ??= '5433';
  process.env.DB_USER ??= 'vault';
  process.env.DB_PASSWORD ??= 'vault';
  process.env.DB_NAME ??= 'vault';

  // MinIO no es necesario para estos tests
}
