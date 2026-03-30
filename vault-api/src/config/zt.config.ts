import { registerAs } from '@nestjs/config';

export default registerAs('zt', () => ({
  hmacSecret: process.env.ZT_HMAC_SECRET ?? 'change_me_zt_secret',
  maxClockSkewMs: Number(process.env.ZT_MAX_CLOCK_SKEW_MS ?? 30000),
}));
