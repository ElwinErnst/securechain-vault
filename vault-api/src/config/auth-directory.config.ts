import { registerAs } from '@nestjs/config';

export default registerAs('authDirectory', () => ({
  baseUrl: process.env.AUTH_DIRECTORY_BASE_URL ?? 'http://localhost:3001/api',
  serviceSecret:
    process.env.AUTH_DIRECTORY_SERVICE_SECRET ?? 'change-me-internal-secret',
  timeoutMs: Number(process.env.AUTH_DIRECTORY_TIMEOUT_MS ?? 5000),
}));
