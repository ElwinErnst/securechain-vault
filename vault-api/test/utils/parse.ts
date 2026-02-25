import type { Response } from 'supertest';
import type { ZodType } from 'zod';

export function parseBody<T>(res: Response, schema: ZodType<T>): T {
  return schema.parse(res.body);
}
